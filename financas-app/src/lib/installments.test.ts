import { describe, it, expect } from 'vitest';
import { distributeInstallments } from './installments';

describe('distributeInstallments', () => {
  it('100,00 em 3x → resto na última', () => {
    expect(distributeInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it('123,45 em 4x', () => {
    expect(distributeInstallments(12345, 4)).toEqual([3086, 3086, 3086, 3087]);
  });

  it('999,99 em 2x', () => {
    expect(distributeInstallments(99999, 2)).toEqual([49999, 50000]);
  });

  it('valor exato em 5x — sem resto', () => {
    expect(distributeInstallments(50000, 5)).toEqual([
      10000, 10000, 10000, 10000, 10000,
    ]);
  });

  it('compra à vista (1x)', () => {
    expect(distributeInstallments(7777, 1)).toEqual([7777]);
  });

  it('soma sempre fecha o total exato', () => {
    const cases: Array<[number, number]> = [
      [12345, 4],
      [999999, 7],
      [333, 12],
      [1, 60],
    ];
    for (const [total, n] of cases) {
      const arr = distributeInstallments(total, n);
      const sum = arr.reduce((a, b) => a + b, 0);
      expect(sum).toBe(total);
    }
  });

  it('rejeita inputs inválidos', () => {
    expect(() => distributeInstallments(-100, 3)).toThrow();
    expect(() => distributeInstallments(100, 0)).toThrow();
    expect(() => distributeInstallments(100, -1)).toThrow();
    expect(() => distributeInstallments(10.5, 3)).toThrow();
  });
});
