'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { addMonths, format } from 'date-fns';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { distributeInstallments } from '@/lib/cards';
import type { ActionResult } from './types';

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');

export const createCardPurchaseSchema = z.object({
  accountId: z.string().min(1, 'Cartão obrigatório'),
  categoryId: z.string().min(1, 'Categoria obrigatória'),
  description: z.string().trim().min(1, 'Descrição obrigatória').max(200),
  totalAmountCents: z
    .number()
    .int()
    .positive('Total deve ser positivo'),
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
  // Camada 1: forma
  const parsed = createCardPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Camada 2: domínio (estado do banco)
  const account = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, parsed.data.accountId))
    .get();
  if (!account || account.kind !== 'credit_card') {
    return {
      ok: false,
      error: 'A conta selecionada precisa ser um cartão de crédito',
      fieldErrors: { accountId: ['Conta deve ser de cartão'] },
    };
  }

  const category = db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, parsed.data.categoryId))
    .get();
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
  const baseDate = new Date(parsed.data.firstInstallmentDate);
  const isMulti = parsed.data.installments > 1;

  db.transaction((tx) => {
    tx.insert(schema.cardPurchases)
      .values({
        id: purchaseId,
        accountId: parsed.data.accountId,
        categoryId: parsed.data.categoryId,
        description: parsed.data.description,
        totalAmount: parsed.data.totalAmountCents,
        installments: parsed.data.installments,
        firstInstallmentDate: parsed.data.firstInstallmentDate,
      })
      .run();

    for (let i = 0; i < amounts.length; i++) {
      const date = format(addMonths(baseDate, i), 'yyyy-MM-dd');
      tx.insert(schema.transactions)
        .values({
          id: ulid(),
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
        })
        .run();
    }
  });

  revalidateCards();
  return {
    ok: true,
    data: { id: purchaseId, transactionsCreated: amounts.length },
  };
}

/**
 * Apaga a compra e suas parcelas — mas APENAS se nenhuma parcela já foi
 * confirmada. Confirmadas viraram histórico; pra removê-las o usuário usa
 * o delete individual em /lancamentos.
 */
export async function deleteCardPurchase(
  id: string
): Promise<ActionResult<{ deletedTransactions: number }>> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const txs = db
    .select({ status: schema.transactions.status })
    .from(schema.transactions)
    .where(eq(schema.transactions.cardPurchaseId, id))
    .all();

  if (txs.some((t) => t.status === 'confirmed')) {
    return {
      ok: false,
      error:
        'Há parcelas já confirmadas. Pra remover, apague as parcelas individualmente em Lançamentos.',
    };
  }

  let deletedTransactions = 0;
  let deletedPurchase = false;

  db.transaction((tx) => {
    const txResult = tx
      .delete(schema.transactions)
      .where(eq(schema.transactions.cardPurchaseId, id))
      .run();
    deletedTransactions = txResult.changes;

    const purchaseResult = tx
      .delete(schema.cardPurchases)
      .where(eq(schema.cardPurchases.id, id))
      .run();
    deletedPurchase = purchaseResult.changes > 0;
  });

  if (!deletedPurchase) return { ok: false, error: 'Compra não encontrada' };

  revalidateCards();
  return { ok: true, data: { deletedTransactions } };
}
