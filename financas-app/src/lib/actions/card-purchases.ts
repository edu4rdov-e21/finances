'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { addMonths, format, parseISO } from 'date-fns';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { distributeInstallments } from '@/lib/cards';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import type { ActionResult } from './types';

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');

const createCardPurchaseSchema = z.object({
  accountId: z.string().min(1, 'Cartão obrigatório'),
  categoryId: z.string().min(1, 'Categoria obrigatória'),
  description: z.string().trim().min(1, 'Descrição obrigatória').max(200),
  totalAmountCents: z.number().int().positive('Total deve ser positivo'),
  installments: z
    .number()
    .int()
    .min(1, 'Mínimo 1 parcela')
    .max(60, 'Máximo 60 parcelas'),
  firstInstallmentDate: ISO_DATE,
});

export type CreateCardPurchaseInput = z.infer<typeof createCardPurchaseSchema>;

function revalidateCards() {
  try {
    revalidatePath('/cartoes');
    revalidatePath('/lancamentos');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }
}

export async function createCardPurchase(
  input: CreateCardPurchaseInput
): Promise<ActionResult<{ id: string; transactionsCreated: number }>> {
  const parsed = createCardPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const workspaceId = await requireActiveWorkspaceId();

  // Validação de domínio escopada ao workspace
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
  if (!account || account.kind !== 'credit_card') {
    return {
      ok: false,
      error: 'A conta selecionada precisa ser um cartão de crédito',
      fieldErrors: { accountId: ['Conta deve ser de cartão'] },
    };
  }

  const [category] = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.workspaceId, workspaceId),
        eq(schema.categories.id, parsed.data.categoryId)
      )
    )
    .limit(1);
  if (!category || category.kind !== 'expense') {
    return {
      ok: false,
      error: 'Categoria precisa ser de despesa',
      fieldErrors: { categoryId: ['Categoria de despesa apenas'] },
    };
  }

  const amounts = distributeInstallments(
    parsed.data.totalAmountCents,
    parsed.data.installments
  );

  const purchaseId = ulid();
  const baseDate = parseISO(parsed.data.firstInstallmentDate);
  const isMulti = parsed.data.installments > 1;

  await db.transaction(async (tx) => {
    await tx.insert(schema.cardPurchases).values({
      id: purchaseId,
      workspaceId,
      accountId: parsed.data.accountId,
      categoryId: parsed.data.categoryId,
      description: parsed.data.description,
      totalAmount: parsed.data.totalAmountCents,
      installments: parsed.data.installments,
      firstInstallmentDate: parsed.data.firstInstallmentDate,
    });

    for (let i = 0; i < amounts.length; i++) {
      const date = format(addMonths(baseDate, i), 'yyyy-MM-dd');
      await tx.insert(schema.transactions).values({
        id: ulid(),
        workspaceId,
        accountId: parsed.data.accountId,
        categoryId: parsed.data.categoryId,
        date,
        amount: amounts[i],
        kind: 'expense',
        description: isMulti
          ? `${parsed.data.description} (${i + 1}/${parsed.data.installments})`
          : parsed.data.description,
        cardPurchaseId: purchaseId,
        status: 'pending',
      });
    }
  });

  revalidateCards();
  return {
    ok: true,
    data: { id: purchaseId, transactionsCreated: amounts.length },
  };
}

export async function deleteCardPurchase(
  id: string
): Promise<ActionResult<{ deletedTransactions: number }>> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const workspaceId = await requireActiveWorkspaceId();

  const txs = await db
    .select({ status: schema.transactions.status })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.cardPurchaseId, id)
      )
    );

  if (txs.some((t) => t.status === 'confirmed')) {
    return {
      ok: false,
      error:
        'Há parcelas já confirmadas. Pra remover, apague as parcelas individualmente em Lançamentos.',
    };
  }

  let deletedTransactions = 0;
  let deletedPurchase = false;

  await db.transaction(async (tx) => {
    const txResult = await tx
      .delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.workspaceId, workspaceId),
          eq(schema.transactions.cardPurchaseId, id)
        )
      )
      .returning({ id: schema.transactions.id });
    deletedTransactions = txResult.length;

    const purchaseResult = await tx
      .delete(schema.cardPurchases)
      .where(
        and(
          eq(schema.cardPurchases.workspaceId, workspaceId),
          eq(schema.cardPurchases.id, id)
        )
      )
      .returning({ id: schema.cardPurchases.id });
    deletedPurchase = purchaseResult.length > 0;
  });

  if (!deletedPurchase) return { ok: false, error: 'Compra não encontrada' };

  revalidateCards();
  return { ok: true, data: { deletedTransactions } };
}
