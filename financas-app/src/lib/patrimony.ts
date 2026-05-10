import { eq } from 'drizzle-orm';
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
  endDate: string; // último dia do mês
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

export type PatrimonySnapshot = {
  date: string;
  investments: number;
  notes: string | null;
};

/**
 * Carrega contas e transactions confirmed do banco e devolve em formato
 * compatível com computePatrimonyAt.
 */
function loadAccountsAndTxs(): {
  accounts: AccountForPatrimony[];
  transactions: TxForPatrimony[];
} {
  const accounts: AccountForPatrimony[] = db
    .select({
      id: schema.accounts.id,
      initialBalance: schema.accounts.initialBalance,
      ownership: schema.accounts.ownership,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.archived, 0))
    .all();

  const transactions: TxForPatrimony[] = db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
      status: schema.transactions.status,
    })
    .from(schema.transactions)
    .all();

  return { accounts, transactions };
}

/**
 * Patrimônio HOJE (em "agora").
 */
export function getCurrentPatrimony(opts: { investments: number }) {
  const { accounts, transactions } = loadAccountsAndTxs();
  const today = format(new Date(), 'yyyy-MM-dd');
  return computePatrimonyAt({
    accounts,
    transactions,
    dateIso: today,
    investments: opts.investments,
  });
}

/**
 * Snapshot do mês corrente (se existe). Snapshots são chaveados por
 * primeiro dia do mês.
 */
export function getCurrentMonthSnapshot(
  now: Date = new Date()
): SnapshotRow | null {
  const monthFirstDay = format(startOfMonth(now), 'yyyy-MM-dd');
  const result = db
    .select()
    .from(schema.assetsSnapshots)
    .where(eq(schema.assetsSnapshots.date, monthFirstDay))
    .get();
  return result
    ? {
        id: result.id,
        date: result.date,
        investments: result.investments,
        notes: result.notes,
      }
    : null;
}

/** Lista todos os snapshots, ordem desc por data. */
export function listSnapshots(): SnapshotRow[] {
  return db
    .select()
    .from(schema.assetsSnapshots)
    .all()
    .map((r) => ({
      id: r.id,
      date: r.date,
      investments: r.investments,
      notes: r.notes,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Série mensal de patrimônio dos últimos N meses (default 12).
 * Para cada mês: snapshot do investments daquele mês (se existir, senão 0)
 * + saldos confirmed das contas no último dia do mês.
 */
export function computeMonthlyPatrimony(
  monthsBack = 12,
  now: Date = new Date()
): PatrimonyMonth[] {
  const { accounts, transactions } = loadAccountsAndTxs();
  const snapshots = listSnapshots();
  const snapByMonth = new Map(snapshots.map((s) => [s.date, s.investments]));

  const out: PatrimonyMonth[] = [];

  // Itera do mês mais antigo pro mais novo (esquerda → direita no gráfico)
  for (let i = monthsBack - 1; i >= 0; i--) {
    const targetMonth = addMonths(now, -i);
    const monthStart = startOfMonth(targetMonth);
    const monthFirstDay = format(monthStart, 'yyyy-MM-dd');
    // Pra mês corrente, usar HOJE como dateIso; senão último dia do mês
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
