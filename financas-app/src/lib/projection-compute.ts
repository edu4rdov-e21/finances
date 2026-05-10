import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Função PURA de projeção + tipos.
 * Sem dependência de banco — IMPORTÁVEL EM CLIENT COMPONENTS.
 *
 * `lib/projection.ts` adiciona `getProjectedBalance` (toca db) por cima.
 *
 * Decisões de domínio (registradas):
 *  - Saldo = soma das contas `checking` apenas. Cartões NÃO entram.
 *  - Pending conta junto com confirmed (spec §13: pessimismo no projetado).
 *  - Mês corrente: o que já passou está em `currentBalance`; o que ainda
 *    vai acontecer entra no delta do mês 0.
 *  - Hypothetical (pra simulador): só afeta se accountId é checking.
 */

export type ProjectionAccount = {
  id: string;
  initialBalance: number;
  kind: 'checking' | 'credit_card';
};

export type ProjectionTx = {
  accountId: string;
  date: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
};

export type HypotheticalTx = ProjectionTx;

export type ProjectionMonth = {
  monthIso: string;
  monthLabel: string;
  periodStart: string;
  periodEnd: string;
  delta: number;
  balance: number;
};

export type ProjectionResult = {
  currentBalance: number;
  currentMonthDelta: number;
  months: ProjectionMonth[];
};

function signed(t: Pick<ProjectionTx, 'amount' | 'kind'>): number {
  if (t.kind === 'income' || t.kind === 'transfer_in') return t.amount;
  return -t.amount;
}

export function computeProjection(opts: {
  accounts: ProjectionAccount[];
  transactions: ProjectionTx[];
  monthsAhead?: number;
  hypothetical?: HypotheticalTx[];
  now?: Date;
}): ProjectionResult {
  const monthsAhead = opts.monthsAhead ?? 12;
  const now = opts.now ?? new Date();
  const hypothetical = opts.hypothetical ?? [];

  const eligible = opts.accounts.filter((a) => a.kind === 'checking');
  const eligibleIds = new Set(eligible.map((a) => a.id));

  if (eligibleIds.size === 0) {
    return { currentBalance: 0, currentMonthDelta: 0, months: [] };
  }

  const initialBalance = eligible.reduce((s, a) => s + a.initialBalance, 0);

  const txs = [...opts.transactions, ...hypothetical].filter((t) =>
    eligibleIds.has(t.accountId)
  );

  const todayIso = format(now, 'yyyy-MM-dd');
  const pastDelta = txs
    .filter((t) => t.date <= todayIso)
    .reduce((s, t) => s + signed(t), 0);
  const currentBalance = initialBalance + pastDelta;

  const monthStartIso = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEndIso = format(endOfMonth(now), 'yyyy-MM-dd');
  const currentMonthDelta = txs
    .filter((t) => t.date >= monthStartIso && t.date <= monthEndIso)
    .reduce((s, t) => s + signed(t), 0);

  const months: ProjectionMonth[] = [];
  let prevBalance = currentBalance;

  for (let i = 0; i < monthsAhead; i++) {
    const targetMonth = addMonths(now, i);
    const periodStart =
      i === 0
        ? format(addDays(now, 1), 'yyyy-MM-dd')
        : format(startOfMonth(targetMonth), 'yyyy-MM-dd');
    const periodEnd = format(endOfMonth(targetMonth), 'yyyy-MM-dd');

    const delta =
      periodStart > periodEnd
        ? 0
        : txs
            .filter((t) => t.date >= periodStart && t.date <= periodEnd)
            .reduce((s, t) => s + signed(t), 0);

    const balance = prevBalance + delta;
    months.push({
      monthIso: format(targetMonth, 'yyyy-MM'),
      monthLabel: format(targetMonth, 'MMM/yy', { locale: ptBR }),
      periodStart,
      periodEnd,
      delta,
      balance,
    });
    prevBalance = balance;
  }

  return { currentBalance, currentMonthDelta, months };
}
