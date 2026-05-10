import { addMonths, format, parseISO } from 'date-fns';
import { distributeInstallments } from './installments';
import type { HypotheticalTx, ProjectionMonth } from './projection-compute';

/**
 * Helpers puros pro simulador. Função `computeProjection` (lib/projection)
 * aceita `hypothetical: HypotheticalTx[]`; aqui construímos esse array a
 * partir dos inputs do form.
 *
 * Decisão de domínio: PESSIMISMO no cartão. Como saldo = só checking, simular
 * uma compra parcelada no cartão "fielmente" não mostraria impacto algum
 * (cartão fora do saldo). O simulador então atribui as parcelas hipotéticas
 * a uma conta checking de origem — mostra "em algum momento essa dívida
 * baterá no saldo". Não é a mecânica real, é proxy de decisão.
 */

/** Compra à vista em uma conta. Gera 1 hypothetical expense. */
export function buildHypotheticalExpense(opts: {
  accountId: string;
  date: string; // YYYY-MM-DD
  amountCents: number;
}): HypotheticalTx[] {
  return [
    {
      accountId: opts.accountId,
      date: opts.date,
      amount: opts.amountCents,
      kind: 'expense',
    },
  ];
}

/**
 * Compra parcelada (no cartão ou na conta). Gera N hypothetical expenses
 * na conta `accountId`, com a distribuição de centavos correta.
 *
 * - À vista (installments=1): equivalente a buildHypotheticalExpense.
 * - Parcelada: gera N entradas, datas = firstInstallmentDate + i meses.
 */
export function buildHypotheticalInstallments(opts: {
  accountId: string;
  firstInstallmentDate: string;
  totalAmountCents: number;
  installments: number;
}): HypotheticalTx[] {
  const amounts = distributeInstallments(
    opts.totalAmountCents,
    opts.installments
  );
  // parseISO interpreta como horário local; new Date(iso) interpretaria UTC
  // e em fuso BR (-3) "andaria" o dia pra trás silenciosamente.
  const baseDate = parseISO(opts.firstInstallmentDate);
  return amounts.map((amount, i) => ({
    accountId: opts.accountId,
    date: format(addMonths(baseDate, i), 'yyyy-MM-dd'),
    amount,
    kind: 'expense',
  }));
}

export type VerdictLevel = 'green' | 'yellow' | 'red';

export type Verdict = {
  level: VerdictLevel;
  message: string;
  /** monthLabel do primeiro mês problemático, se houver */
  problemMonth?: string;
};

/**
 * Classifica a saúde de uma projeção:
 *  - red: algum mês fica negativo
 *  - yellow: algum mês fica entre 0 e reserva
 *  - green: tudo acima da reserva
 *
 * Reserve = 0 desliga o teste yellow (só red ou green).
 */
export function computeVerdict(opts: {
  months: ProjectionMonth[];
  reserve: number;
}): Verdict {
  const firstNegative = opts.months.find((m) => m.balance < 0);
  if (firstNegative) {
    return {
      level: 'red',
      message: `Não recomendado — saldo negativo em ${firstNegative.monthLabel}`,
      problemMonth: firstNegative.monthLabel,
    };
  }

  if (opts.reserve > 0) {
    const firstBelow = opts.months.find(
      (m) => m.balance >= 0 && m.balance < opts.reserve
    );
    if (firstBelow) {
      return {
        level: 'yellow',
        message: `Pode comprar, mas aperta em ${firstBelow.monthLabel}`,
        problemMonth: firstBelow.monthLabel,
      };
    }
  }

  return {
    level: 'green',
    message: 'Pode comprar com folga',
  };
}
