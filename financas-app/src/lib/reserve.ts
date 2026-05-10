import { format, startOfMonth, subDays, subMonths } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import type { ProjectionAccount } from './projection-compute';

export type ReserveTx = {
  accountId: string;
  date: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  status: 'confirmed' | 'pending';
};

export const DEFAULT_RESERVE_PCT = 0.3;
export const DEFAULT_RESERVE_WINDOW_MONTHS = 3;

/**
 * Cálculo PURO. Recebe estado já lido + parâmetros, devolve centavos.
 */
export function computeMinimumReserve(opts: {
  accounts: ProjectionAccount[];
  transactions: ReserveTx[];
  pct?: number;
  windowMonths?: number;
  now?: Date;
}): number {
  const pct = opts.pct ?? DEFAULT_RESERVE_PCT;
  const windowMonths = opts.windowMonths ?? DEFAULT_RESERVE_WINDOW_MONTHS;
  const now = opts.now ?? new Date();

  const eligibleIds = new Set(
    opts.accounts
      .filter((a) => a.kind === 'checking')
      .map((a) => a.id)
  );

  if (eligibleIds.size === 0) return 0;

  const currentMonthStart = startOfMonth(now);
  const windowStart = subMonths(currentMonthStart, windowMonths);
  const windowEnd = subDays(currentMonthStart, 1);

  const fromIso = format(windowStart, 'yyyy-MM-dd');
  const toIso = format(windowEnd, 'yyyy-MM-dd');

  const totalExpense = opts.transactions
    .filter(
      (t) =>
        t.kind === 'expense' &&
        t.status === 'confirmed' &&
        eligibleIds.has(t.accountId) &&
        t.date >= fromIso &&
        t.date <= toIso
    )
    .reduce((s, t) => s + t.amount, 0);

  return Math.round((totalExpense / windowMonths) * pct);
}

/**
 * Versão que toca o banco. Server-only.
 */
export async function getMinimumReserve(
  workspaceId: string,
  opts: {
    pct?: number;
    windowMonths?: number;
    now?: Date;
  } = {}
): Promise<number> {
  const accounts: ProjectionAccount[] = await db
    .select({
      id: schema.accounts.id,
      initialBalance: schema.accounts.initialBalance,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.archived, 0)
      )
    );

  const transactions: ReserveTx[] = await db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
      status: schema.transactions.status,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));

  return computeMinimumReserve({ ...opts, accounts, transactions });
}
