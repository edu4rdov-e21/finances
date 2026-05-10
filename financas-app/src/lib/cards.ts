import { and, desc, eq } from 'drizzle-orm';
import { addMonths, format, lastDayOfMonth } from 'date-fns';
import { db, schema } from '@/db/client';

export type CreditCardRow = typeof schema.accounts.$inferSelect;
export type CardPurchase = typeof schema.cardPurchases.$inferSelect;

export type CardPurchaseSummary = {
  id: string;
  workspaceId: string;
  accountId: string;
  categoryId: string;
  description: string;
  totalAmount: number;
  installments: number;
  firstInstallmentDate: string;
  createdAt: string;
  categoryName: string | null;
  paidCount: number;
  totalCount: number;
  remainingAmount: number;
};

// Re-exporta a função pura de installments — mantém quem importa daqui sem quebra.
export { distributeInstallments } from './installments';

/** Retorna o `day` clamped pro último dia do mês (cuida de fev e meses de 30). */
function clampDayToMonth(year: number, month: number, day: number): Date {
  const last = lastDayOfMonth(new Date(year, month, 1)).getDate();
  return new Date(year, month, Math.min(day, last));
}

/**
 * Calcula o ciclo da fatura em aberto.
 *
 * Retorna null se o cartão ainda não tem closing_day/due_day configurados
 * (estado inicial — Eduardo configura em /config).
 */
export function getCardCycle(
  card: CreditCardRow,
  now: Date = new Date()
): { prevClosing: Date; nextClosing: Date; nextDue: Date } | null {
  if (!card.closingDay || !card.dueDay) return null;

  const closingThisMonth = clampDayToMonth(
    now.getFullYear(),
    now.getMonth(),
    card.closingDay
  );

  let nextClosing: Date;
  let prevClosing: Date;
  if (now <= closingThisMonth) {
    nextClosing = closingThisMonth;
    prevClosing = clampDayToMonth(
      now.getFullYear(),
      now.getMonth() - 1,
      card.closingDay
    );
  } else {
    nextClosing = clampDayToMonth(
      now.getFullYear(),
      now.getMonth() + 1,
      card.closingDay
    );
    prevClosing = closingThisMonth;
  }

  // Vencimento: dueDay no mês após o closing
  const dueRef = addMonths(nextClosing, 1);
  const nextDue = clampDayToMonth(
    dueRef.getFullYear(),
    dueRef.getMonth(),
    card.dueDay
  );

  return { prevClosing, nextClosing, nextDue };
}

/** Cartões de crédito ativos do workspace. */
export async function listCreditCards(
  workspaceId: string
): Promise<CreditCardRow[]> {
  return await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.kind, 'credit_card'),
        eq(schema.accounts.archived, 0)
      )
    )
    .orderBy(schema.accounts.name);
}

/**
 * Soma centavos das transactions do cartão dentro do ciclo aberto.
 *
 * Se o cartão não tem ciclo configurado (sem closing/due), devolve a soma
 * de todas as transactions de despesa do cartão — assim a tela mostra algo
 * mesmo antes de o usuário ajustar /config.
 */
export async function getOpenInvoiceTotal(
  workspaceId: string,
  cardId: string,
  now: Date = new Date()
): Promise<number> {
  const [card] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.id, cardId)
      )
    )
    .limit(1);
  if (!card) return 0;

  const cycle = getCardCycle(card, now);
  const allTxs = await db
    .select({
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      kind: schema.transactions.kind,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.transactions.accountId, cardId)
      )
    );

  if (!cycle) {
    return allTxs
      .filter((t) => t.kind === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
  }

  const fromIso = format(cycle.prevClosing, 'yyyy-MM-dd');
  const toIso = format(cycle.nextClosing, 'yyyy-MM-dd');

  return allTxs
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.date > fromIso &&
        t.date <= toIso
    )
    .reduce((acc, t) => acc + t.amount, 0);
}

/**
 * Compras parceladas do cartão com agregados por compra:
 * paidCount (confirmed), totalCount (todas), remainingAmount (pending sum).
 *
 * Usa N+1 queries propositalmente — volume baixo, código limpo. Otimizar
 * com window function ou subquery quando virar gargalo (não vai ser logo).
 */
export async function listCardPurchases(
  workspaceId: string,
  cardId: string
): Promise<CardPurchaseSummary[]> {
  const purchases = await db
    .select({
      id: schema.cardPurchases.id,
      workspaceId: schema.cardPurchases.workspaceId,
      accountId: schema.cardPurchases.accountId,
      categoryId: schema.cardPurchases.categoryId,
      description: schema.cardPurchases.description,
      totalAmount: schema.cardPurchases.totalAmount,
      installments: schema.cardPurchases.installments,
      firstInstallmentDate: schema.cardPurchases.firstInstallmentDate,
      createdAt: schema.cardPurchases.createdAt,
      categoryName: schema.categories.name,
    })
    .from(schema.cardPurchases)
    .leftJoin(
      schema.categories,
      eq(schema.cardPurchases.categoryId, schema.categories.id)
    )
    .where(
      and(
        eq(schema.cardPurchases.workspaceId, workspaceId),
        eq(schema.cardPurchases.accountId, cardId)
      )
    )
    .orderBy(desc(schema.cardPurchases.firstInstallmentDate));

  // Agregados por purchase: N+1 query (volume baixo, código limpo)
  const out: CardPurchaseSummary[] = [];
  for (const p of purchases) {
    const txs = await db
      .select({
        amount: schema.transactions.amount,
        status: schema.transactions.status,
      })
      .from(schema.transactions)
      .where(eq(schema.transactions.cardPurchaseId, p.id));

    const paidCount = txs.filter((t) => t.status === 'confirmed').length;
    const totalCount = txs.length;
    const remainingAmount = txs
      .filter((t) => t.status === 'pending')
      .reduce((s, t) => s + t.amount, 0);

    out.push({ ...p, paidCount, totalCount, remainingAmount });
  }
  return out;
}
