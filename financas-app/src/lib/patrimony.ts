import { and, eq } from 'drizzle-orm';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db, schema } from '@/db/client';
import {
  computePatrimonyAt,
  type AccountForPatrimony,
  type TxForPatrimony,
} from './patrimony-compute';

export type PatrimonyMonth = {
  monthIso: string;
  monthLabel: string;
  endDate: string;
  checking: number;
  cards: number;
  investments: number;
  total: number;
};

export type SnapshotRow = {
  id: string;
  date: string;
  investments: number;
  notes: string | null;
};

async function loadAccountsAndTxs(workspaceId: string): Promise<{
  accounts: AccountForPatrimony[];
  transactions: TxForPatrimony[];
}> {
  const accounts: AccountForPatrimony[] = await db
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

  const transactions: TxForPatrimony[] = await db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
      status: schema.transactions.status,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));

  return { accounts, transactions };
}

export async function getCurrentPatrimony(
  workspaceId: string,
  opts: { investments: number }
) {
  const { accounts, transactions } = await loadAccountsAndTxs(workspaceId);
  const today = format(new Date(), 'yyyy-MM-dd');
  return computePatrimonyAt({
    accounts,
    transactions,
    dateIso: today,
    investments: opts.investments,
  });
}

export async function getCurrentMonthSnapshot(
  workspaceId: string,
  now: Date = new Date()
): Promise<SnapshotRow | null> {
  const monthFirstDay = format(startOfMonth(now), 'yyyy-MM-dd');
  const [result] = await db
    .select()
    .from(schema.assetsSnapshots)
    .where(
      and(
        eq(schema.assetsSnapshots.workspaceId, workspaceId),
        eq(schema.assetsSnapshots.date, monthFirstDay)
      )
    )
    .limit(1);
  return result
    ? {
        id: result.id,
        date: result.date,
        investments: result.investments,
        notes: result.notes,
      }
    : null;
}

export async function listSnapshots(
  workspaceId: string
): Promise<SnapshotRow[]> {
  const rows = await db
    .select()
    .from(schema.assetsSnapshots)
    .where(eq(schema.assetsSnapshots.workspaceId, workspaceId));
  return rows
    .map((r) => ({
      id: r.id,
      date: r.date,
      investments: r.investments,
      notes: r.notes,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function computeMonthlyPatrimony(
  workspaceId: string,
  monthsBack = 12,
  now: Date = new Date()
): Promise<PatrimonyMonth[]> {
  const { accounts, transactions } = await loadAccountsAndTxs(workspaceId);
  const snapshots = await listSnapshots(workspaceId);
  const snapByMonth = new Map(snapshots.map((s) => [s.date, s.investments]));

  const out: PatrimonyMonth[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const targetMonth = addMonths(now, -i);
    const monthStart = startOfMonth(targetMonth);
    const monthFirstDay = format(monthStart, 'yyyy-MM-dd');
    const isCurrentMonth = i === 0;
    const dateIso = isCurrentMonth
      ? format(now, 'yyyy-MM-dd')
      : format(endOfMonth(targetMonth), 'yyyy-MM-dd');

    const investments = snapByMonth.get(monthFirstDay) ?? 0;
    const result = computePatrimonyAt({
      accounts,
      transactions,
      dateIso,
      investments,
    });

    out.push({
      monthIso: format(monthStart, 'yyyy-MM'),
      monthLabel: format(monthStart, 'MMM/yy', { locale: ptBR }),
      endDate: dateIso,
      ...result,
    });
  }

  return out;
}
