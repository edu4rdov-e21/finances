import { describe, it, expect } from 'vitest';
import {
  computeProjection,
  type ProjectionAccount,
  type ProjectionTx,
} from './projection';

const NOW = new Date('2026-05-09');

const accountChecking = (overrides: Partial<ProjectionAccount> = {}): ProjectionAccount => ({
  id: 'itau-pf',
  initialBalance: 0,
  kind: 'checking',
  ...overrides,
});

const accountCard = (overrides: Partial<ProjectionAccount> = {}): ProjectionAccount => ({
  id: 'amex',
  initialBalance: 0,
  kind: 'credit_card',
  ...overrides,
});

const tx = (overrides: Partial<ProjectionTx>): ProjectionTx => ({
  accountId: 'itau-pf',
  date: '2026-05-09',
  amount: 0,
  kind: 'expense',
  ...overrides,
});

describe('computeProjection', () => {
  it('app vazio (sem contas) → saldo zero, sem meses', () => {
    const result = computeProjection({ accounts: [], transactions: [], now: NOW });
    expect(result.currentBalance).toBe(0);
    expect(result.currentMonthDelta).toBe(0);
    expect(result.months).toHaveLength(0);
  });

  it('currentMonthDelta soma todo o mês corrente (passado + futuro)', () => {
    const result = computeProjection({
      accounts: [accountChecking({ initialBalance: 0 })],
      transactions: [
        tx({ date: '2026-05-05', amount: 80000, kind: 'expense' }), // passado
        tx({ date: '2026-05-25', amount: 50000, kind: 'income' }), // futuro
        tx({ date: '2026-04-30', amount: 99999, kind: 'expense' }), // FORA do mês corrente
        tx({ date: '2026-06-01', amount: 99999, kind: 'expense' }), // FORA do mês corrente
      ],
      monthsAhead: 1,
      now: NOW,
    });
    // Mês corrente = mai. Soma signed: -80000 + 50000 = -30000
    expect(result.currentMonthDelta).toBe(-30000);
  });

  it('só contas checking, sem transactions → saldo = soma initial; meses constantes', () => {
    const result = computeProjection({
      accounts: [
        accountChecking({ id: 'itau', initialBalance: 100000 }),
        accountChecking({ id: 'cora', initialBalance: 50000 }),
      ],
      transactions: [],
      monthsAhead: 3,
      now: NOW,
    });
    expect(result.currentBalance).toBe(150000);
    expect(result.months.map((m) => m.balance)).toEqual([150000, 150000, 150000]);
    expect(result.months.map((m) => m.delta)).toEqual([0, 0, 0]);
  });

  it('expense passado entra no saldo atual; futuro entra no delta', () => {
    const result = computeProjection({
      accounts: [accountChecking({ initialBalance: 200000 })],
      transactions: [
        tx({ date: '2026-05-05', amount: 50000, kind: 'expense' }), // já passou
        tx({ date: '2026-05-20', amount: 30000, kind: 'expense' }), // futuro neste mês
        tx({ date: '2026-06-15', amount: 10000, kind: 'expense' }), // mês 1
      ],
      monthsAhead: 3,
      now: NOW,
    });
    expect(result.currentBalance).toBe(150000); // 200k - 50k
    expect(result.months[0].delta).toBe(-30000);
    expect(result.months[0].balance).toBe(120000);
    expect(result.months[1].delta).toBe(-10000);
    expect(result.months[1].balance).toBe(110000);
    expect(result.months[2].balance).toBe(110000);
  });

  it('transactions em cartão de crédito são IGNORADAS', () => {
    const result = computeProjection({
      accounts: [
        accountChecking({ id: 'itau', initialBalance: 100000 }),
        accountCard({ id: 'amex' }),
      ],
      transactions: [
        tx({ accountId: 'amex', date: '2026-05-15', amount: 80000, kind: 'expense' }),
      ],
      monthsAhead: 2,
      now: NOW,
    });
    // Saldo de checking não cai mesmo com R$ 800 no cartão
    expect(result.currentBalance).toBe(100000);
    expect(result.months[0].balance).toBe(100000);
  });

  it('income futuro aumenta saldo no mês alvo', () => {
    const result = computeProjection({
      accounts: [accountChecking({ initialBalance: 0 })],
      transactions: [
        tx({ date: '2026-06-05', amount: 850000, kind: 'income' }),
        tx({ date: '2026-07-05', amount: 850000, kind: 'income' }),
      ],
      monthsAhead: 3,
      now: NOW,
    });
    expect(result.currentBalance).toBe(0);
    expect(result.months[0].balance).toBe(0); // mai
    expect(result.months[1].balance).toBe(850000); // jun
    expect(result.months[2].balance).toBe(1700000); // jul (acumula)
  });

  it('transferência entre dois checking se cancela no consolidado', () => {
    const result = computeProjection({
      accounts: [
        accountChecking({ id: 'itau', initialBalance: 100000 }),
        accountChecking({ id: 'cora', initialBalance: 50000 }),
      ],
      transactions: [
        tx({ accountId: 'itau', date: '2026-05-15', amount: 30000, kind: 'transfer_out' }),
        tx({ accountId: 'cora', date: '2026-05-15', amount: 30000, kind: 'transfer_in' }),
      ],
      monthsAhead: 2,
      now: NOW,
    });
    // Soma não muda — transferência interna se cancela
    expect(result.currentBalance).toBe(150000);
    expect(result.months[0].balance).toBe(150000);
  });

  it('pagamento de fatura (transfer checking→cartão) só conta o lado out', () => {
    const result = computeProjection({
      accounts: [
        accountChecking({ id: 'itau', initialBalance: 200000 }),
        accountCard({ id: 'amex' }),
      ],
      transactions: [
        tx({ accountId: 'itau', date: '2026-05-15', amount: 80000, kind: 'transfer_out' }),
        tx({ accountId: 'amex', date: '2026-05-15', amount: 80000, kind: 'transfer_in' }),
      ],
      monthsAhead: 2,
      now: NOW,
    });
    // Saldo cai R$ 800 (transfer_in pro cartão é ignorado, cartão não é checking)
    expect(result.months[0].balance).toBe(120000);
  });

  it('hypothetical injeta tx adicional (caso simulador)', () => {
    const result = computeProjection({
      accounts: [accountChecking({ initialBalance: 100000 })],
      transactions: [],
      hypothetical: [
        tx({ date: '2026-06-15', amount: 30000, kind: 'expense' }),
      ],
      monthsAhead: 3,
      now: NOW,
    });
    expect(result.currentBalance).toBe(100000);
    expect(result.months[0].balance).toBe(100000); // mai não muda
    expect(result.months[1].balance).toBe(70000); // jun: -300
    expect(result.months[2].balance).toBe(70000); // jul: mantém
  });

  it('saldo cumulativo correto ao longo de 12 meses', () => {
    const result = computeProjection({
      accounts: [accountChecking({ initialBalance: 100000 })],
      transactions: Array.from({ length: 12 }, (_, i) => {
        const month = ((4 + i) % 12) + 1; // partindo de mai (4 + 1 = 5 = mai)
        const year = 2026 + Math.floor((4 + i) / 12);
        return tx({
          date: `${year}-${String(month).padStart(2, '0')}-15`,
          amount: 10000,
          kind: 'expense',
        });
      }),
      monthsAhead: 12,
      now: NOW,
    });
    // 12 expenses de R$ 100, uma por mês
    expect(result.currentBalance).toBe(100000); // hoje 9, expenses dia 15 — todas futuras
    expect(result.months[0].balance).toBe(90000); // mai: -100
    expect(result.months[11].balance).toBe(-20000); // após 12: 1000 - 1200 = -200
  });
});
