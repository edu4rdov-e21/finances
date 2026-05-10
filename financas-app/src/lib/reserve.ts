import { format, startOfMonth, subDays, subMonths } from 'date-fns';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import type { Ownership, ProjectionAccount } from './projection';

/**
 * Reserva mínima recomendada (spec §6.3).
 *
 *   reserva = (soma_expenses_confirmed_ultimos_N_meses / N) * pct
 *
 * Decisões de domínio:
 *  - Histórico = expenses CONFIRMED em contas checking. Pending histórico
 *    é ambíguo (saiu? não saiu?) — preferir subestimar reserva (defensivo).
 *  - Janela = N meses anteriores ao corrente. Mês em curso não conta
 *    (incompleto, distorceria média).
 *  - Cartões fora da soma — coerente com a definição de saldo (só checking).
 *  - Transferências fora — são internas, não é despesa real.
 */

export type ReserveTx = {
  accountId: string;
  date: string; // YYYY-MM-DD
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
  ownership?: Ownership;
  now?: Date;
}): number {
  const pct = opts.pct ?? DEFAULT_RESERVE_PCT;
  const windowMonths = opts.windowMonths ?? DEFAULT_RESERVE_WINDOW_MONTHS;
  const ownership = opts.ownership ?? 'both';
  const now = opts.now ?? new Date();

  const eligibleIds = new Set(
    opts.accounts
      .filter(
        (a) =>
          a.kind === 'checking' &&
          (ownership === 'both' || a.ownership === ownership)
      )
      .map((a) => a.id)
  );

  if (eligibleIds.size === 0) return 0;

  // Janela: do início do mês "now - windowMonths" até o último dia do mês
  // anterior ao corrente.
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
export function getMinimumReserve(
  opts: {
    pct?: number;
    windowMonths?: number;
    ownership?: Ownership;
    now?: Date;
  } = {}
): number {
  const accounts: ProjectionAccount[] = db
    .select({
      id: schema.accounts.id,
      initialBalance: schema.accounts.initialBalance,
      ownership: schema.accounts.ownership,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.archived, 0))
    .all();

  const transactions: ReserveTx[] = db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
      status: schema.transactions.status,
    })
    .from(schema.transactions)
    .all();

  return computeMinimumReserve({ ...opts, accounts, transactions });
}
