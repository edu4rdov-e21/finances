'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  createTransactionSchema,
  updateTransactionSchema,
  createTransferSchema,
  getTransferCategory,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type CreateTransferInput,
} from '@/lib/transactions';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import type { ActionResult } from './types';
export type { ActionResult };

function revalidateMutations() {
  try {
    revalidatePath('/lancamentos');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (
    parsed.data.kind === 'transfer_out' ||
    parsed.data.kind === 'transfer_in'
  ) {
    return {
      ok: false,
      error: 'Transferências devem ser criadas via createTransfer',
    };
  }

  const workspaceId = await requireActiveWorkspaceId();
  const id = ulid();
  await db.insert(schema.transactions).values({
    id,
    workspaceId,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId ?? null,
    date: parsed.data.date,
    amount: parsed.data.amountCents,
    kind: parsed.data.kind,
    description: parsed.data.description,
    notes: parsed.data.notes ?? null,
    status: 'confirmed',
  });

  revalidateMutations();
  return { ok: true, data: { id } };
}

export async function createTransfer(
  input: CreateTransferInput
): Promise<ActionResult<{ transferId: string }>> {
  const parsed = createTransferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const workspaceId = await requireActiveWorkspaceId();
  const transferOutCategory = await getTransferCategory(
    workspaceId,
    'expense'
  );
  const transferInCategory = await getTransferCategory(workspaceId, 'income');
  if (!transferOutCategory || !transferInCategory) {
    return {
      ok: false,
      error: 'Categoria "Transferência" não encontrada — rode npm run seed',
    };
  }

  const transferId = ulid();
  const outId = ulid();
  const inId = ulid();

  await db.transaction(async (tx) => {
    await tx.insert(schema.transactions).values({
      id: outId,
      workspaceId,
      accountId: parsed.data.fromAccountId,
      categoryId: transferOutCategory.id,
      date: parsed.data.date,
      amount: parsed.data.amountCents,
      kind: 'transfer_out',
      description: parsed.data.description,
      notes: parsed.data.notes ?? null,
      transferId,
      status: 'confirmed',
    });

    await tx.insert(schema.transactions).values({
      id: inId,
      workspaceId,
      accountId: parsed.data.toAccountId,
      categoryId: transferInCategory.id,
      date: parsed.data.date,
      amount: parsed.data.amountCents,
      kind: 'transfer_in',
      description: parsed.data.description,
      notes: parsed.data.notes ?? null,
      transferId,
      status: 'confirmed',
    });
  });

  revalidateMutations();
  return { ok: true, data: { transferId } };
}

export async function updateTransaction(
  input: UpdateTransactionInput
): Promise<ActionResult> {
  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const workspaceId = await requireActiveWorkspaceId();
  const { id, amountCents, ...rest } = parsed.data;
  const setData: Partial<typeof schema.transactions.$inferInsert> = {
    ...rest,
    ...(amountCents !== undefined && { amount: amountCents }),
  };

  if (Object.keys(setData).length === 0) {
    return { ok: false, error: 'Nenhum campo pra atualizar' };
  }

  const result = await db
    .update(schema.transactions)
    .set(setData)
    .where(
      and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.workspaceId, workspaceId)
      )
    )
    .returning({ id: schema.transactions.id });

  if (result.length === 0) {
    return { ok: false, error: 'Transação não encontrada' };
  }

  revalidateMutations();
  return { ok: true, data: undefined };
}

export async function deleteTransaction(
  id: string
): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const workspaceId = await requireActiveWorkspaceId();
  const result = await db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.id, id),
        eq(schema.transactions.workspaceId, workspaceId)
      )
    )
    .returning({ id: schema.transactions.id });

  if (result.length === 0) {
    return { ok: false, error: 'Transação não encontrada' };
  }

  revalidateMutations();
  return { ok: true, data: undefined };
}
