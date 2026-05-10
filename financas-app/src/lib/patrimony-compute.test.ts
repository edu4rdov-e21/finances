import { describe, it, expect } from 'vitest';
import {
  computeAccountBalanceAt,
  computePatrimonyAt,
  type AccountForPatrimony,
  type TxForPatrimony,
} from './patrimony-compute';

const account = (
  over: Partial<AccountForPatrimony> = {}
): AccountForPatrimony => ({
  id: 'itau',
  initialBalance: 0,
  kind: 'checking',
  ...over,
});

const tx = (over: Partial<TxForPatrimony>): TxForPatrimony => ({
  accountId: 'itau',
  date: '2026-05-09',
  amount: 0,
  kind: 'expense',
  status: 'confirmed',
  ...over,
});

describe('computeAccountBalanceAt', () => {
  it('só initialBalance se sem transactions', () => {
    const r = computeAccountBalanceAt({
      account: account({ initialBalance: 100000 }),
      transactions: [],
      dateIso: '2026-05-09',
    });
    expect(r).toBe(100000);
  });

  it('soma confirmed até a data', () => {
    const r = computeAccountBalanceAt({
      account: account({ initialBalance: 100000 }),
      transactions: [
        tx({ date: '2026-05-01', amount: 30000, kind: 'expense' }),
        tx({ date: '2026-05-08', amount: 50000, kind: 'income' }),
      ],
      dateIso: '2026-05-09',
    });
    // 100k - 30k + 50k = 120k
    expect(r).toBe(120000);
  });

  it('ignora transactions DEPOIS da data', () => {
    const r = computeAccountBalanceAt({
      account: account({ initialBalance: 100000 }),
      transactions: [
        tx({ date: '2026-05-01', amount: 30000, kind: 'expense' }),
        tx({ date: '2026-05-15', amount: 99999, kind: 'expense' }),
      ],
      dateIso: '2026-05-09',
    });
    // só conta a de 05-01
    expect(r).toBe(70000);
  });

  it('ignora pending (só confirmed)', () => {
    const r = computeAccountBalanceAt({
      account: account({ initialBalance: 100000 }),
      transactions: [
        tx({ date: '2026-05-01', amount: 30000, kind: 'expense', status: 'pending' }),
        tx({ date: '2026-05-08', amount: 20000, kind: 'expense', status: 'confirmed' }),
      ],
      dateIso: '2026-05-09',
    });
    // só -20k (a pending é ignorada)
    expect(r).toBe(80000);
  });

  it('ignora transactions de outra conta', () => {
    const r = computeAccountBalanceAt({
      account: account({ id: 'itau', initialBalance: 100000 }),
      transactions: [
        tx({ accountId: 'cora', date: '2026-05-01', amount: 30000 }),
      ],
      dateIso: '2026-05-09',
    });
    expect(r).toBe(100000);
  });
});

describe('computePatrimonyAt', () => {
  it('soma checking + cards + investments', () => {
    const r = computePatrimonyAt({
      accounts: [
        account({ id: 'itau', initialBalance: 200000, kind: 'checking' }),
        account({ id: 'amex', initialBalance: 0, kind: 'credit_card' }),
      ],
      transactions: [
        tx({ accountId: 'amex', date: '2026-05-05', amount: 50000, kind: 'expense' }),
      ],
      dateIso: '2026-05-09',
      investments: 1000000, // R$ 10.000 em investments manuais
    });
    expect(r.checking).toBe(200000);
    expect(r.cards).toBe(-50000); // -R$ 500 (gastos pendentes de pagamento)
    expect(r.investments).toBe(1000000);
    expect(r.total).toBe(1150000); // 2k - 500 + 10k = 11.5k
  });

  it('sem contas → total = só investments', () => {
    const r = computePatrimonyAt({
      accounts: [],
      transactions: [],
      dateIso: '2026-05-09',
      investments: 500000,
    });
    expect(r.total).toBe(500000);
  });

  it('cartão pago via transferência: saldo do cartão volta a 0', () => {
    const r = computePatrimonyAt({
      accounts: [
        account({ id: 'itau', initialBalance: 100000, kind: 'checking' }),
        account({ id: 'amex', initialBalance: 0, kind: 'credit_card' }),
      ],
      transactions: [
        tx({ accountId: 'amex', date: '2026-04-01', amount: 30000, kind: 'expense' }),
        // pagamento da fatura: sai da Itaú, entra no Amex
        tx({ accountId: 'itau', date: '2026-05-05', amount: 30000, kind: 'transfer_out' }),
        tx({ accountId: 'amex', date: '2026-05-05', amount: 30000, kind: 'transfer_in' }),
      ],
      dateIso: '2026-05-09',
      investments: 0,
    });
    expect(r.checking).toBe(70000); // Itaú: 100k - 30k transfer_out
    expect(r.cards).toBe(0); // Amex: -30k expense + 30k transfer_in
    expect(r.total).toBe(70000); // patrimônio = só checking
  });
});
