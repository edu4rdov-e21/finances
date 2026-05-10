import { describe, it, expect } from 'vitest';
import {
  buildHypotheticalExpense,
  buildHypotheticalInstallments,
  computeVerdict,
} from './simulator';
import type { ProjectionMonth } from './projection';

describe('buildHypotheticalExpense', () => {
  it('gera 1 expense', () => {
    const result = buildHypotheticalExpense({
      accountId: 'itau',
      date: '2026-05-15',
      amountCents: 12345,
    });
    expect(result).toEqual([
      { accountId: 'itau', date: '2026-05-15', amount: 12345, kind: 'expense' },
    ]);
  });
});

describe('buildHypotheticalInstallments', () => {
  it('1x = 1 parcela', () => {
    const result = buildHypotheticalInstallments({
      accountId: 'itau',
      firstInstallmentDate: '2026-05-15',
      totalAmountCents: 7777,
      installments: 1,
    });
    expect(result).toEqual([
      { accountId: 'itau', date: '2026-05-15', amount: 7777, kind: 'expense' },
    ]);
  });

  it('3x = 3 parcelas mensais com resto na última', () => {
    const result = buildHypotheticalInstallments({
      accountId: 'itau',
      firstInstallmentDate: '2026-05-15',
      totalAmountCents: 10000,
      installments: 3,
    });
    expect(result).toEqual([
      { accountId: 'itau', date: '2026-05-15', amount: 3333, kind: 'expense' },
      { accountId: 'itau', date: '2026-06-15', amount: 3333, kind: 'expense' },
      { accountId: 'itau', date: '2026-07-15', amount: 3334, kind: 'expense' },
    ]);
  });

  it('soma das parcelas fecha total exato', () => {
    const result = buildHypotheticalInstallments({
      accountId: 'itau',
      firstInstallmentDate: '2026-01-31',
      totalAmountCents: 99999,
      installments: 7,
    });
    const sum = result.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(99999);
  });

  it('respeita clamp de fim de mês (jan/31 → fev/28)', () => {
    const result = buildHypotheticalInstallments({
      accountId: 'itau',
      firstInstallmentDate: '2026-01-31',
      totalAmountCents: 30000,
      installments: 3,
    });
    expect(result.map((r) => r.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });
});

const month = (label: string, balance: number): ProjectionMonth => ({
  monthIso: '2026-06',
  monthLabel: label,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  delta: 0,
  balance,
});

describe('computeVerdict', () => {
  it('verde: tudo acima da reserva', () => {
    const result = computeVerdict({
      months: [month('jun/26', 500000), month('jul/26', 600000)],
      reserve: 100000,
    });
    expect(result.level).toBe('green');
    expect(result.message).toBe('Pode comprar com folga');
    expect(result.problemMonth).toBeUndefined();
  });

  it('amarelo: algum mês entre 0 e reserva', () => {
    const result = computeVerdict({
      months: [
        month('jun/26', 500000),
        month('jul/26', 50000), // abaixo de 100k
        month('ago/26', 600000),
      ],
      reserve: 100000,
    });
    expect(result.level).toBe('yellow');
    expect(result.problemMonth).toBe('jul/26');
    expect(result.message).toContain('jul/26');
  });

  it('vermelho: algum mês negativo (precedência sobre amarelo)', () => {
    const result = computeVerdict({
      months: [
        month('jun/26', 50000), // abaixo de reserva
        month('jul/26', -10000), // negativo
        month('ago/26', 600000),
      ],
      reserve: 100000,
    });
    // Vermelho indica o PRIMEIRO mês negativo
    expect(result.level).toBe('red');
    expect(result.problemMonth).toBe('jul/26');
    expect(result.message).toContain('jul/26');
  });

  it('reserve=0 desliga teste amarelo', () => {
    const result = computeVerdict({
      months: [month('jun/26', 100), month('jul/26', 50)],
      reserve: 0,
    });
    // Saldo positivo, sem reserva pra checar — verde
    expect(result.level).toBe('green');
  });

  it('reserve=0 ainda pega vermelho', () => {
    const result = computeVerdict({
      months: [month('jun/26', -1000)],
      reserve: 0,
    });
    expect(result.level).toBe('red');
  });
});
