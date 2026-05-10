import { describe, it, expect } from 'vitest';
import { computeMinimumReserve, type ReserveTx } from './reserve';
import type { ProjectionAccount } from './projection';

const NOW = new Date('2026-05-09'); // janela default = fev/mar/abr 2026

const checking = (over: Partial<ProjectionAccount> = {}): ProjectionAccount => ({
  id: 'itau',
  initialBalance: 0,
  ownership: 'PF',
  kind: 'checking',
  ...over,
});

const card = (over: Partial<ProjectionAccount> = {}): ProjectionAccount => ({
  id: 'amex',
  initialBalance: 0,
  ownership: 'PF',
  kind: 'credit_card',
  ...over,
});

const expenseTx = (over: Partial<ReserveTx>): ReserveTx => ({
  accountId: 'itau',
  date: '2026-04-15',
  amount: 0,
  kind: 'expense',
  status: 'confirmed',
  ...over,
});

describe('computeMinimumReserve', () => {
  it('sem contas → 0', () => {
    expect(
      computeMinimumReserve({ accounts: [], transactions: [], now: NOW })
    ).toBe(0);
  });

  it('sem expenses no histórico → 0', () => {
    expect(
      computeMinimumReserve({
        accounts: [checking()],
        transactions: [],
        now: NOW,
      })
    ).toBe(0);
  });

  it('R$ 3.000 em expenses na janela → reserva = 1000 / 3 × 0.3 = 100,00 (cents 30000 / 3 = 10000 × 0.3 = 3000? no espera)', () => {
    // Total: 300.000 centavos. / 3 meses = 100.000 média mensal. × 0.3 = 30.000 centavos = R$ 300
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2026-02-10', amount: 100000 }),
        expenseTx({ date: '2026-03-10', amount: 100000 }),
        expenseTx({ date: '2026-04-10', amount: 100000 }),
      ],
      now: NOW,
    });
    expect(result).toBe(30000);
  });

  it('expenses fora da janela são ignoradas (anterior a 3 meses)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2025-12-10', amount: 999999 }), // muito antigo
        expenseTx({ date: '2026-04-10', amount: 90000 }),
      ],
      now: NOW,
    });
    // Só conta 90.000. Média = 30.000. × 0.3 = 9.000
    expect(result).toBe(9000);
  });

  it('expenses do mês corrente são ignoradas (mês em curso)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2026-05-05', amount: 999999 }), // mês corrente
        expenseTx({ date: '2026-04-10', amount: 60000 }),
      ],
      now: NOW,
    });
    // Só conta 60.000. Média = 20.000. × 0.3 = 6.000
    expect(result).toBe(6000);
  });

  it('pending histórico é IGNORADO (defensivo)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2026-04-10', amount: 100000, status: 'pending' }),
        expenseTx({ date: '2026-04-15', amount: 60000, status: 'confirmed' }),
      ],
      now: NOW,
    });
    // Só 60.000 entra. Média 20.000. × 0.3 = 6.000
    expect(result).toBe(6000);
  });

  it('expenses em cartão de crédito são ignoradas (cartão não é checking)', () => {
    const result = computeMinimumReserve({
      accounts: [checking({ id: 'itau' }), card({ id: 'amex' })],
      transactions: [
        expenseTx({ accountId: 'amex', date: '2026-04-10', amount: 999999 }),
        expenseTx({ accountId: 'itau', date: '2026-04-10', amount: 30000 }),
      ],
      now: NOW,
    });
    // Só conta itau. Média 10.000. × 0.3 = 3.000
    expect(result).toBe(3000);
  });

  it('transferências e income não contam (só expense)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2026-04-10', amount: 30000, kind: 'transfer_out' }),
        expenseTx({ date: '2026-04-10', amount: 30000, kind: 'income' }),
        expenseTx({ date: '2026-04-10', amount: 90000, kind: 'expense' }),
      ],
      now: NOW,
    });
    // Só 90.000 (kind=expense). Média 30.000. × 0.3 = 9.000
    expect(result).toBe(9000);
  });

  it('ownership PF ignora expenses em conta PJ', () => {
    const result = computeMinimumReserve({
      accounts: [
        checking({ id: 'itau', ownership: 'PF' }),
        checking({ id: 'cora-pj', ownership: 'PJ' }),
      ],
      transactions: [
        expenseTx({ accountId: 'cora-pj', date: '2026-04-10', amount: 999999 }),
        expenseTx({ accountId: 'itau', date: '2026-04-10', amount: 60000 }),
      ],
      ownership: 'PF',
      now: NOW,
    });
    // Só itau. Média 20.000. × 0.3 = 6.000
    expect(result).toBe(6000);
  });

  it('pct customizado (50%)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [expenseTx({ date: '2026-04-10', amount: 90000 })],
      pct: 0.5,
      now: NOW,
    });
    // 90.000 / 3 = 30.000 × 0.5 = 15.000
    expect(result).toBe(15000);
  });

  it('windowMonths customizado (6 meses)', () => {
    const result = computeMinimumReserve({
      accounts: [checking()],
      transactions: [
        expenseTx({ date: '2025-12-10', amount: 60000 }),
        expenseTx({ date: '2026-01-10', amount: 60000 }),
        expenseTx({ date: '2026-02-10', amount: 60000 }),
        expenseTx({ date: '2026-03-10', amount: 60000 }),
        expenseTx({ date: '2026-04-10', amount: 60000 }),
      ],
      windowMonths: 6,
      now: NOW,
    });
    // Janela: nov/2025 a abr/2026 (6 meses). 5 expenses × 60.000 = 300.000 / 6 = 50.000 × 0.3 = 15.000
    expect(result).toBe(15000);
  });
});
