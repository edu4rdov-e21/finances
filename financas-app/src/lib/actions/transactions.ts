'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
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

import type { ActionResult } from './types';
export type { ActionResult };

function revalidateMutations() {
  // revalidatePath só funciona em contexto de request Next. Scripts (tsx,
  // seeds, smoke tests) rodam fora desse contexto e disparam invariante.
  // Try/catch silencia: em runtime real, o catch é inerte.
  try {
    revalidatePath('/lancamentos');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }
}

/**
 * Cria UMA transação (entrada ou saída em uma única conta).
 * Transferências entre contas usam createTransfer.
 */
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

  const id = ulid();
  db.insert(schema.transactions)
    .values({
      id,
      accountId: parsed.data.accountId,
      categoryId: parsed.data.categoryId ?? null,
      date: parsed.data.date,
      amount: parsed.data.amountCents,
      kind: parsed.data.kind,
      description: parsed.data.description,
      notes: parsed.data.notes ?? null,
      status: 'confirmed',
    })
    .run();

  revalidateMutations();
  return { ok: true, data: { id } };
}

/**
 * Cria DUAS transactions atomicamente: transfer_out na origem, transfer_in
 * no destino. Mesmo `transfer_id` em ambas pra ligar os lados.
 *
 * Se qualquer insert falhar, o SQLite faz rollback dos dois.
 */
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

  const transferOutCategory = getTransferCategory('expense');
  const transferInCategory = getTransferCategory('income');
  if (!transferOutCategory || !transferInCategory) {
    return {
      ok: false,
      error: 'Categoria "Transferência" não encontrada — rode npm run seed',
    };
  }

  const transferId = ulid();
  const outId = ulid();
  const inId = ulid();

  db.transaction((tx) => {
    tx.insert(schema.transactions)
      .values({
        id: outId,
        accountId: parsed.data.fromAccountId,
        categoryId: transferOutCategory.id,
        date: parsed.data.date,
        amount: parsed.data.amountCents,
        kind: 'transfer_out',
        description: parsed.data.description,
        notes: parsed.data.notes ?? null,
        transferId,
        status: 'confirmed',
      })
      .run();

    tx.insert(schema.transactions)
      .values({
        id: inId,
        accountId: parsed.data.toAccountId,
        categoryId: transferInCategory.id,
        date: parsed.data.date,
        amount: parsed.data.amountCents,
        kind: 'transfer_in',
        description: parsed.data.description,
        notes: parsed.data.notes ?? null,
        transferId,
        status: 'confirmed',
      })
      .run();
  });

  revalidateMutations();
  return { ok: true, data: { transferId } };
}

/**
 * Atualiza campos parciais de UMA transaction.
 * Drizzle ignora campos `undefined` no SET — só o que veio é alterado.
 */
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

  const { id, amountCents, ...rest } = parsed.data;
  const setData: Partial<typeof schema.transactions.$inferInsert> = {
    ...rest,
    ...(amountCents !== undefined && { amount: amountCents }),
  };

  if (Object.keys(setData).length === 0) {
    return { ok: false, error: 'Nenhum campo pra atualizar' };
  }

  const result = db
    .update(schema.transactions)
    .set(setData)
    .where(eq(schema.transactions.id, id))
    .run();

  if (result.changes === 0) {
    return { ok: false, error: 'Transação não encontrada' };
  }

  revalidateMutations();
  return { ok: true, data: undefined };
}

/**
 * Hard delete. Se a transaction tiver transfer_id, apaga só o lado pedido —
 * o outro lado fica órfão. Decisão consciente: pra MVP, edição/delete de
 * transferência é responsabilidade do usuário escolher os dois lados.
 *
 * (Soft delete pode entrar depois se aparecer caso de "desfazer".)
 */
export async function deleteTransaction(
  id: string
): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const result = db
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .run();

  if (result.changes === 0) {
    return { ok: false, error: 'Transação não encontrada' };
  }

  revalidateMutations();
  return { ok: true, data: undefined };
}
