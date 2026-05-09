'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  createRecurringRuleSchema,
  updateRecurringRuleSchema,
  generateRecurringTransactions,
  type CreateRecurringRuleInput,
  type UpdateRecurringRuleInput,
} from '@/lib/recurring';
import type { ActionResult } from './types';

function revalidateRecurring() {
  try {
    revalidatePath('/recorrencias');
    revalidatePath('/lancamentos');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }
}

/**
 * Apaga só as transactions PENDING geradas pela regra.
 * Confirmadas ficam — viraram histórico.
 */
function deletePendingFor(ruleId: string) {
  return db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.recurringRuleId, ruleId),
        eq(schema.transactions.status, 'pending')
      )
    )
    .run();
}

export async function createRecurringRule(
  input: CreateRecurringRuleInput
): Promise<ActionResult<{ id: string; generated: number }>> {
  const parsed = createRecurringRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const id = ulid();
  db.insert(schema.recurringRules)
    .values({
      id,
      accountId: parsed.data.accountId,
      categoryId: parsed.data.categoryId,
      kind: parsed.data.kind,
      description: parsed.data.description,
      amount: parsed.data.amount,
      dayOfMonth: parsed.data.dayOfMonth,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      active: 1,
    })
    .run();

  const { generated } = generateRecurringTransactions();

  revalidateRecurring();
  return { ok: true, data: { id, generated } };
}

export async function updateRecurringRule(
  input: UpdateRecurringRuleInput
): Promise<ActionResult<{ generated: number }>> {
  const parsed = updateRecurringRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, ...rest } = parsed.data;
  if (Object.keys(rest).length === 0) {
    return { ok: false, error: 'Nenhum campo pra atualizar' };
  }

  // Atomicamente: atualiza regra + apaga pending dessa regra.
  // Re-geração roda fora (idempotente — se falhar, próxima execução cobre).
  let updated = false;
  db.transaction((tx) => {
    const result = tx
      .update(schema.recurringRules)
      .set(rest)
      .where(eq(schema.recurringRules.id, id))
      .run();
    if (result.changes === 0) return;
    updated = true;
    tx.delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.recurringRuleId, id),
          eq(schema.transactions.status, 'pending')
        )
      )
      .run();
  });

  if (!updated) return { ok: false, error: 'Regra não encontrada' };

  const { generated } = generateRecurringTransactions();
  revalidateRecurring();
  return { ok: true, data: { generated } };
}

export async function deleteRecurringRule(
  id: string
): Promise<ActionResult<{ deletedPending: number }>> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  let deletedPending = 0;
  let deletedRule = false;

  db.transaction((tx) => {
    const txResult = tx
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.recurringRuleId, id),
          eq(schema.transactions.status, 'pending')
        )
      )
      .run();
    deletedPending = txResult.changes;

    const ruleResult = tx
      .delete(schema.recurringRules)
      .where(eq(schema.recurringRules.id, id))
      .run();
    deletedRule = ruleResult.changes > 0;
  });

  if (!deletedRule) return { ok: false, error: 'Regra não encontrada' };

  revalidateRecurring();
  return { ok: true, data: { deletedPending } };
}

export async function toggleRecurringRule(
  id: string,
  active: boolean
): Promise<ActionResult<{ generated: number; deletedPending: number }>> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const result = db
    .update(schema.recurringRules)
    .set({ active: active ? 1 : 0 })
    .where(eq(schema.recurringRules.id, id))
    .run();
  if (result.changes === 0) {
    return { ok: false, error: 'Regra não encontrada' };
  }

  let generated = 0;
  let deletedPending = 0;
  if (active) {
    generated = generateRecurringTransactions().generated;
  } else {
    deletedPending = deletePendingFor(id).changes;
  }

  revalidateRecurring();
  return { ok: true, data: { generated, deletedPending } };
}
