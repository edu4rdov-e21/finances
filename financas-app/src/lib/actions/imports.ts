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
import { requireActiveWorkspaceId } from '@/lib/workspace';
import type { ParsedRawTx } from '@/lib/parsers/types';
import type { ActionResult } from './types';

const SOURCE = z.enum(['csv', 'ofx', 'pdf', 'md']);

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
  categoryId: z.string().min(1).nullable(),
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

  const workspaceId = await requireActiveWorkspaceId();

  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.id, parsed.data.accountId)
      )
    )
    .limit(1);
  if (!account) {
    return {
      ok: false,
      error: 'Conta não encontrada',
      fieldErrors: { accountId: ['Conta inválida'] },
    };
  }

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

  const items = await buildImportPreview({
    workspaceId,
    parsed: rawTxs,
    accountId: parsed.data.accountId,
  });

  await applyAnthropicCategorization(workspaceId, items);

  const batchId = ulid();
  await db.insert(schema.importBatches).values({
    id: batchId,
    workspaceId,
    accountId: parsed.data.accountId,
    source: parsed.data.source,
    filename: parsed.data.filename,
    totalRows: items.length,
    status: 'pending_review',
  });

  return { ok: true, data: { batchId, items } };
}

async function applyAnthropicCategorization(
  workspaceId: string,
  items: ImportPreviewItem[]
): Promise<void> {
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

  const categoriesRaw = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.workspaceId, workspaceId),
        eq(schema.categories.archived, 0)
      )
    );

  if (categoriesRaw.length === 0) return;

  const categoryOptions = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
  }));

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
      if (cat.kind !== needCategory[idx].item.kind) continue;

      needCategory[idx].item.suggestedCategoryId = sug.categoryId;
    }
  } catch (err) {
    console.error('[previewImport] Anthropic categorization failed:', err);
  }
}

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

  const workspaceId = await requireActiveWorkspaceId();

  const [batch] = await db
    .select()
    .from(schema.importBatches)
    .where(
      and(
        eq(schema.importBatches.workspaceId, workspaceId),
        eq(schema.importBatches.id, parsed.data.batchId)
      )
    )
    .limit(1);
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

  await db.transaction(async (tx) => {
    for (const item of parsed.data.items) {
      await tx.insert(schema.transactions).values({
        id: ulid(),
        workspaceId,
        accountId: batch.accountId,
        categoryId: item.categoryId,
        date: item.date,
        amount: item.amountCents,
        kind: item.kind,
        description: item.rawDescription,
        externalHash: item.externalHash,
        importBatchId: batch.id,
        status: 'confirmed',
      });
      created++;

      if (item.categoryId) {
        const [existing] = await tx
          .select()
          .from(schema.categoryLearnings)
          .where(
            and(
              eq(schema.categoryLearnings.workspaceId, workspaceId),
              eq(
                schema.categoryLearnings.descriptionPattern,
                item.normalizedDescription
              )
            )
          )
          .limit(1);

        const now = new Date().toISOString();
        if (existing) {
          const wasSameCategory = existing.categoryId === item.categoryId;
          await tx
            .update(schema.categoryLearnings)
            .set({
              categoryId: item.categoryId,
              weight: wasSameCategory ? existing.weight + 1 : 1,
              lastUsedAt: now,
            })
            .where(eq(schema.categoryLearnings.id, existing.id));
        } else {
          await tx.insert(schema.categoryLearnings).values({
            id: ulid(),
            workspaceId,
            descriptionPattern: item.normalizedDescription,
            categoryId: item.categoryId,
            weight: 1,
            lastUsedAt: now,
          });
        }
        learningsUpdated++;
      }
    }

    await tx
      .update(schema.importBatches)
      .set({ status: 'confirmed' })
      .where(eq(schema.importBatches.id, batch.id));
  });

  revalidateImports();
  return { ok: true, data: { created, learningsUpdated } };
}

export async function discardImport(
  batchId: string
): Promise<ActionResult> {
  if (!batchId) return { ok: false, error: 'ID obrigatório' };

  const workspaceId = await requireActiveWorkspaceId();

  const result = await db
    .update(schema.importBatches)
    .set({ status: 'discarded' })
    .where(
      and(
        eq(schema.importBatches.workspaceId, workspaceId),
        eq(schema.importBatches.id, batchId),
        eq(schema.importBatches.status, 'pending_review')
      )
    )
    .returning({ id: schema.importBatches.id });

  if (result.length === 0) {
    return {
      ok: false,
      error: 'Batch não encontrado ou já confirmado/descartado',
    };
  }

  revalidateImports();
  return { ok: true, data: undefined };
}
