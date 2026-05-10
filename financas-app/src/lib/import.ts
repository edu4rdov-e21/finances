import { createHash } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import type { ParsedRawTx } from './parsers/types';

/**
 * Pipeline de importação. Recebe ParsedRawTx[] (saída de parsers/csv.ts ou
 * parsers/ofx.ts) + accountId destino, e devolve ImportPreviewItem[]
 * anotado com hashes, dedup, parcelas, e categoria sugerida via learnings.
 *
 * Categorização via Anthropic API entra na Etapa 8.
 */

export type InstallmentInfo = { current: number; total: number };

export type ImportPreviewItem = {
  date: string;
  rawDescription: string;
  normalizedDescription: string;
  amountCents: number; // sempre positivo (sinal vai pro kind)
  kind: 'expense' | 'income';
  externalHash: string;
  installmentInfo: InstallmentInfo | null;
  suggestedCategoryId: string | null;
  /** ID da transaction existente que tem o mesmo hash (sugestão de duplicata). */
  duplicateOfId: string | null;
};

/**
 * Normaliza descrição pra hash e match de categoria. Tira acentos, case,
 * números longos (CPF/cód), asteriscos e símbolos. Colapsa espaços.
 *
 *   "UBER *TRIP HELP 12345"      → "uber trip help"
 *   "PIX TRANSF 27/04 ANA SOUZA" → "pix transf ana souza"
 */
export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/\d{4,}/g, '') // tira números 4+ dígitos (CPF, codigos, data colada)
    .replace(/[*]/g, '') // asteriscos
    .replace(/[^a-z0-9\s]/g, ' ') // outras pontuações viram espaço
    .replace(/\s+/g, ' ') // colapsa espaços
    .trim();
}

/**
 * Hash determinístico pros campos que identificam a transação.
 * Roda no server (Node crypto). Saída hex (64 chars).
 */
export function computeExternalHash(opts: {
  accountId: string;
  date: string;
  amountCents: number;
  description: string; // raw ou normalized — vamos normalizar aqui pra garantir
}): string {
  const normalized = normalizeDescription(opts.description);
  const input = `${opts.accountId}|${opts.date}|${opts.amountCents}|${normalized}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Detecta padrões de parcela em descrições. Conservador: exige prefixo
 * ou marcador explícito pra evitar falsos positivos com datas.
 *
 *   "NOTEBOOK PARC 3/12"     → { current: 3, total: 12 }
 *   "Compra Parcela 2 de 10" → { current: 2, total: 10 }
 *   "Apple 1 DE 12"          → { current: 1, total: 12 }
 *   "fatura 27/04"           → null (data, não parcela)
 */
export function detectInstallment(
  description: string
): InstallmentInfo | null {
  const patterns: RegExp[] = [
    /\bparc(?:ela)?\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i, // PARC 3/12, Parcela 3/12
    /\bparc(?:ela)?\.?\s*(\d{1,2})\s*de\s*(\d{1,2})\b/i, // Parcela 2 de 10
    /\b(\d{1,2})\s*de\s*(\d{1,2})\b/i, // 1 DE 12 (em maiúsculas geralmente)
  ];

  for (const re of patterns) {
    const m = description.match(re);
    if (!m) continue;
    const current = Number(m[1]);
    const total = Number(m[2]);
    if (
      Number.isInteger(current) &&
      Number.isInteger(total) &&
      total >= 2 &&
      total <= 99 &&
      current >= 1 &&
      current <= total
    ) {
      return { current, total };
    }
  }
  return null;
}

/**
 * Match local em `category_learnings`. Substring simples — se a descrição
 * normalizada CONTÉM o pattern aprendido, sugere a categoria.
 *
 * Ordena por weight desc primeiro: matches mais "votados" ganham.
 * Levenshtein fuzzy fica pra evolução, se for preciso.
 */
export async function categorizeFromLearnings(
  workspaceId: string,
  normalized: string
): Promise<{ categoryId: string; weight: number } | null> {
  const learnings = await db
    .select()
    .from(schema.categoryLearnings)
    .where(eq(schema.categoryLearnings.workspaceId, workspaceId));

  const sorted = [...learnings].sort((a, b) => b.weight - a.weight);

  for (const l of sorted) {
    if (l.descriptionPattern && normalized.includes(l.descriptionPattern)) {
      return { categoryId: l.categoryId, weight: l.weight };
    }
  }
  return null;
}

/**
 * Pipeline completo. Para cada ParsedRawTx, monta ImportPreviewItem com
 * hash, dedup contra transactions existentes do workspace, parcela detectada,
 * categoria sugerida via learnings.
 */
export async function buildImportPreview(opts: {
  workspaceId: string;
  parsed: ParsedRawTx[];
  accountId: string;
}): Promise<ImportPreviewItem[]> {
  const items: ImportPreviewItem[] = [];
  for (const p of opts.parsed) {
    if (p.amountCents === 0) continue;
    const normalized = normalizeDescription(p.description);
    const hash = computeExternalHash({
      accountId: opts.accountId,
      date: p.date,
      amountCents: p.amountCents,
      description: p.description,
    });
    const installmentInfo = detectInstallment(p.description);
    const suggestion = await categorizeFromLearnings(
      opts.workspaceId,
      normalized
    );
    items.push({
      date: p.date,
      rawDescription: p.description,
      normalizedDescription: normalized,
      amountCents: Math.abs(p.amountCents),
      kind: p.amountCents >= 0 ? 'income' : 'expense',
      externalHash: hash,
      installmentInfo,
      suggestedCategoryId: suggestion?.categoryId ?? null,
      duplicateOfId: null,
    });
  }

  // Lookup duplicatas em batch — uma query, escopada ao workspace
  if (items.length > 0) {
    const hashes = items.map((i) => i.externalHash);
    const existing = await db
      .select({
        id: schema.transactions.id,
        externalHash: schema.transactions.externalHash,
      })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.workspaceId, opts.workspaceId),
          inArray(schema.transactions.externalHash, hashes)
        )
      );

    const hashToId = new Map<string, string>();
    for (const e of existing) {
      if (e.externalHash) hashToId.set(e.externalHash, e.id);
    }
    for (const item of items) {
      const dup = hashToId.get(item.externalHash);
      if (dup) item.duplicateOfId = dup;
    }
  }

  return items;
}
