'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { parseCSV } from '@/lib/parsers/csv';
import { parseOFX } from '@/lib/parsers/ofx';
import { parseMarkdown } from '@/lib/parsers/markdown';
import { parsePDFToTransactions, categorizeBatch } from '@/lib/anthropic';
import {
  buildImportPreview,
  type ImportPreviewItem,
} from '@/lib/import';
import type { ParsedRawTx } from '@/lib/parsers/types';
import type { ActionResult } from './types';

const SOURCE = z.enum(['csv', 'ofx', 'pdf', 'md']);

// Em arquivos com 'use server', SÓ funções async podem ser exportadas.
// Schemas Zod (que são objects) e ITEM_KIND (z.enum) ficam const interno.
// Tipos (export type) são apagados em runtime, então passam.

const previewImportSchema = z.object({
  content: z.string().min(1, 'Arquivo vazio'),
  source: SOURCE,
  accountId: z.string().min(1, 'Conta obrigatória'),
  filename: z.string().min(1).max(200),
});

export type PreviewImportInput = z.infer<typeof previewImportSchema>;

const ITEM_KIND = z.enum(['expense', 'income']);

const confirmImportItemSchema = z.object({
  externalHash: z.string().length(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rawDescription: z.string().min(1).max(500),
  normalizedDescription: z.string().min(1),
  amountCents: z.number().int().positive(),
  kind: ITEM_KIND,
  /** null = sem categoria; usuário pode confirmar sem categorizar */
  categoryId: z.string().min(1).nullable(),
  /** Categoria sugerida originalmente — null se não houve sugestão */
  originalSuggestedCategoryId: z.string().min(1).nullable(),
});

const confirmImportSchema = z.object({
  batchId: z.string().min(1),
  items: z.array(confirmImportItemSchema).min(1, 'Nenhum item selecionado'),
});

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;

function revalidateImports() {
  try {
    revalidatePath('/lancamentos');
    revalidatePath('/');
    revalidatePath('/importar');
  } catch {
    /* fora de contexto Next */
  }
}

/**
 * Lê arquivo, parseia, monta preview anotado, persiste batch pending_review.
 */
export async function previewImport(
  input: PreviewImportInput
): Promise<
  ActionResult<{ batchId: string; items: ImportPreviewItem[] }>
> {
  const parsed = previewImportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Validar conta
  const account = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, parsed.data.accountId))
    .get();
  if (!account) {
    return {
      ok: false,
      error: 'Conta não encontrada',
      fieldErrors: { accountId: ['Conta inválida'] },
    };
  }

  // Parser por source. PDF passa por LLM; CSV/OFX são parsers locais.
  // PDF parse falhar é fatal (sem parse, não há preview). CSV/OFX falhar
  // por arquivo malformado também é fatal.
  let rawTxs: ParsedRawTx[];
  try {
    if (parsed.data.source === 'pdf') {
      rawTxs = await parsePDFToTransactions(parsed.data.content);
    } else if (parsed.data.source === 'csv') {
      rawTxs = parseCSV(parsed.data.content);
    } else if (parsed.data.source === 'md') {
      rawTxs = parseMarkdown(parsed.data.content);
    } else {
      rawTxs = parseOFX(parsed.data.content);
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Falha ao processar o arquivo',
    };
  }

  if (rawTxs.length === 0) {
    return {
      ok: false,
      error:
        'Não foi possível extrair lançamentos. Verifique o formato do arquivo.',
    };
  }

  // Pipeline base (hash, dedup, parcelas, learnings local)
  const items = buildImportPreview({
    parsed: rawTxs,
    accountId: parsed.data.accountId,
  });

  // Categorização Anthropic — só pros items que não casaram com learnings.
  // Falha aqui é silenciosa: o usuário categoriza manualmente no preview.
  await applyAnthropicCategorization(items);

  // Cria batch
  const batchId = ulid();
  db.insert(schema.importBatches)
    .values({
      id: batchId,
      accountId: parsed.data.accountId,
      source: parsed.data.source,
      filename: parsed.data.filename,
      totalRows: items.length,
      status: 'pending_review',
    })
    .run();

  return { ok: true, data: { batchId, items } };
}

/**
 * Categorização via Anthropic pra items sem sugestão local.
 * Mutação in-place: preenche `suggestedCategoryId` nos items aplicáveis.
 *
 * Falhas são silenciosas — graceful degradation. Items continuam sem
 * sugestão; usuário categoriza manualmente no preview.
 */
async function applyAnthropicCategorization(
  items: ImportPreviewItem[]
): Promise<void> {
  // Pares (item, posição original em items[]) sem sugestão ainda.
  const needCategory: Array<{
    item: ImportPreviewItem;
    originalIndex: number;
  }> = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i].suggestedCategoryId) {
      needCategory.push({ item: items[i], originalIndex: i });
    }
  }
  if (needCategory.length === 0) return;

  const categoriesRaw = db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.archived, 0))
    .all();

  if (categoriesRaw.length === 0) return;

  const categoryOptions = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
  }));

  // Indexa categorias por id pra checagem de kind compatível depois.
  const categoryById = new Map(categoriesRaw.map((c) => [c.id, c]));

  const categorizationInputs = needCategory.map(({ item }, idx) => ({
    index: idx,
    description: item.rawDescription,
    amountCents: item.amountCents,
    kind: item.kind,
  }));

  try {
    const suggestions = await categorizeBatch({
      items: categorizationInputs,
      categories: categoryOptions,
    });

    for (let idx = 0; idx < needCategory.length; idx++) {
      const sug = suggestions.get(idx);
      if (!sug) continue;
      const cat = categoryById.get(sug.categoryId);
      if (!cat) continue;
      // Defesa final: kind tem que bater (LLM pode ocasionalmente sugerir
      // categoria expense pra item income — defesa em camadas)
      if (cat.kind !== needCategory[idx].item.kind) continue;

      needCategory[idx].item.suggestedCategoryId = sug.categoryId;
    }
  } catch (err) {
    // Graceful degradation: logamos, mas o preview continua sem sugestões
    // automáticas. Usuário categoriza manualmente.
    console.error('[previewImport] Anthropic categorization failed:', err);
  }
}

/**
 * Confirma a importação. Atomic:
 *  1. Insere as transactions
 *  2. Atualiza category_learnings (aprende com correções e confirmações)
 *  3. Marca batch como confirmed
 */
export async function confirmImport(
  input: ConfirmImportInput
): Promise<
  ActionResult<{ created: number; learningsUpdated: number }>
> {
  const parsed = confirmImportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const batch = db
    .select()
    .from(schema.importBatches)
    .where(eq(schema.importBatches.id, parsed.data.batchId))
    .get();
  if (!batch) {
    return { ok: false, error: 'Batch de importação não encontrado' };
  }
  if (batch.status !== 'pending_review') {
    return {
      ok: false,
      error: `Batch já foi ${
        batch.status === 'confirmed' ? 'confirmado' : 'descartado'
      }`,
    };
  }

  let created = 0;
  let learningsUpdated = 0;

  db.transaction((tx) => {
    for (const item of parsed.data.items) {
      tx.insert(schema.transactions)
        .values({
          id: ulid(),
          accountId: batch.accountId,
          categoryId: item.categoryId,
          date: item.date,
          amount: item.amountCents,
          kind: item.kind,
          description: item.rawDescription,
          externalHash: item.externalHash,
          importBatchId: batch.id,
          status: 'confirmed',
        })
        .run();
      created++;

      // Aprender se há categoria. Se pattern já existe pra mesma categoria,
      // weight++. Se mudou de categoria, sobrescreve. Se novo, cria.
      if (item.categoryId) {
        const existing = tx
          .select()
          .from(schema.categoryLearnings)
          .where(
            eq(
              schema.categoryLearnings.descriptionPattern,
              item.normalizedDescription
            )
          )
          .get();

        const now = new Date().toISOString();
        if (existing) {
          const newCategoryId = item.categoryId;
          const wasSameCategory = existing.categoryId === newCategoryId;
          tx.update(schema.categoryLearnings)
            .set({
              categoryId: newCategoryId,
              weight: wasSameCategory ? existing.weight + 1 : 1,
              lastUsedAt: now,
            })
            .where(eq(schema.categoryLearnings.id, existing.id))
            .run();
        } else {
          tx.insert(schema.categoryLearnings)
            .values({
              id: ulid(),
              descriptionPattern: item.normalizedDescription,
              categoryId: item.categoryId,
              weight: 1,
              lastUsedAt: now,
            })
            .run();
        }
        learningsUpdated++;
      }
    }

    tx.update(schema.importBatches)
      .set({ status: 'confirmed' })
      .where(eq(schema.importBatches.id, batch.id))
      .run();
  });

  revalidateImports();
  return { ok: true, data: { created, learningsUpdated } };
}

/**
 * Marca o batch como descartado. Não cria transactions; nada de aprendizado.
 */
export async function discardImport(
  batchId: string
): Promise<ActionResult> {
  if (!batchId) return { ok: false, error: 'ID obrigatório' };

  const result = db
    .update(schema.importBatches)
    .set({ status: 'discarded' })
    .where(
      and(
        eq(schema.importBatches.id, batchId),
        eq(schema.importBatches.status, 'pending_review')
      )
    )
    .run();

  if (result.changes === 0) {
    return {
      ok: false,
      error: 'Batch não encontrado ou já confirmado/descartado',
    };
  }

  revalidateImports();
  return { ok: true, data: undefined };
}
