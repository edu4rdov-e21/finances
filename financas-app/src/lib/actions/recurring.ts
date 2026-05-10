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
import { requireActiveWorkspaceId } from '@/lib/workspace';
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

async function deletePendingFor(workspaceId: string, ruleId: string) {
  const result = await db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.recurringRuleId, ruleId),
        eq(schema.transactions.status, 'pending')
      )
    )
    .returning({ id: schema.transactions.id });
  return { count: result.length };
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

  const workspaceId = await requireActiveWorkspaceId();
  const id = ulid();
  await db.insert(schema.recurringRules).values({
    id,
    workspaceId,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId,
    kind: parsed.data.kind,
    description: parsed.data.description,
    amount: parsed.data.amount,
    dayOfMonth: parsed.data.dayOfMonth,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    active: 1,
  });

  const { generated } = await generateRecurringTransactions(workspaceId);

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

  const workspaceId = await requireActiveWorkspaceId();
  let updated = false;
  await db.transaction(async (tx) => {
    const result = await tx
      .update(schema.recurringRules)
      .set(rest)
      .where(
        and(
          eq(schema.recurringRules.workspaceId, workspaceId),
          eq(schema.recurringRules.id, id)
        )
      )
      .returning({ id: schema.recurringRules.id });
    if (result.length === 0) return;
    updated = true;
    await tx
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.workspaceId, workspaceId),
          eq(schema.transactions.recurringRuleId, id),
          eq(schema.transactions.status, 'pending')
        )
      );
  });

  if (!updated) return { ok: false, error: 'Regra não encontrada' };

  const { generated } = await generateRecurringTransactions(workspaceId);
  revalidateRecurring();
  return { ok: true, data: { generated } };
}

export async function deleteRecurringRule(
  id: string
): Promise<ActionResult<{ deletedPending: number }>> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const workspaceId = await requireActiveWorkspaceId();
  let deletedPending = 0;
  let deletedRule = false;

  await db.transaction(async (tx) => {
    const txResult = await tx
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.workspaceId, workspaceId),
          eq(schema.transactions.recurringRuleId, id),
          eq(schema.transactions.status, 'pending')
        )
      )
      .returning({ id: schema.transactions.id });
    deletedPending = txResult.length;

    const ruleResult = await tx
      .delete(schema.recurringRules)
      .where(
        and(
          eq(schema.recurringRules.workspaceId, workspaceId),
          eq(schema.recurringRules.id, id)
        )
      )
      .returning({ id: schema.recurringRules.id });
    deletedRule = ruleResult.length > 0;
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

  const workspaceId = await requireActiveWorkspaceId();
  const result = await db
    .update(schema.recurringRules)
    .set({ active: active ? 1 : 0 })
    .where(
      and(
        eq(schema.recurringRules.workspaceId, workspaceId),
        eq(schema.recurringRules.id, id)
      )
    )
    .returning({ id: schema.recurringRules.id });
  if (result.length === 0) {
    return { ok: false, error: 'Regra não encontrada' };
  }

  let generated = 0;
  let deletedPending = 0;
  if (active) {
    generated = (await generateRecurringTransactions(workspaceId)).generated;
  } else {
    deletedPending = (await deletePendingFor(workspaceId, id)).count;
  }

  revalidateRecurring();
  return { ok: true, data: { generated, deletedPending } };
}
