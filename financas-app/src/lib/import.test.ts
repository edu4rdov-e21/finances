import { describe, it, expect } from 'vitest';
import {
  normalizeDescription,
  computeExternalHash,
  detectInstallment,
} from './import';

describe('normalizeDescription', () => {
  it('lowercase + remove acentos', () => {
    expect(normalizeDescription('Pão de Açúcar')).toBe('pao de acucar');
  });

  it('remove asteriscos', () => {
    expect(normalizeDescription('UBER *TRIP HELP')).toBe('uber trip help');
  });

  it('remove números longos (CPF, código)', () => {
    expect(normalizeDescription('PIX TRANSF 12345 ANA')).toBe(
      'pix transf ana'
    );
  });

  it('mantém números curtos (1-3 dígitos)', () => {
    expect(normalizeDescription('PARC 2/10')).toBe('parc 2 10');
  });

  it('colapsa espaços múltiplos', () => {
    expect(normalizeDescription('A    B   C')).toBe('a b c');
  });

  it('pontuação vira espaço', () => {
    expect(normalizeDescription('UBER, IFOOD; STARBUCKS!')).toBe(
      'uber ifood starbucks'
    );
  });

  it('preserva semântica entre variações', () => {
    expect(normalizeDescription('UBER *TRIP')).toBe(
      normalizeDescription('uber  trip')
    );
    expect(normalizeDescription('Pão  de  Açúcar')).toBe(
      normalizeDescription('PÃO DE AÇÚCAR')
    );
  });
});

describe('computeExternalHash', () => {
  it('mesma entrada → mesmo hash (determinístico)', () => {
    const a = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'UBER TRIP',
    });
    const b = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'UBER TRIP',
    });
    expect(a).toBe(b);
  });

  it('hash hex de 64 caracteres', () => {
    const h = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'X',
    });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('descrições equivalentes (case/acentos) geram mesmo hash', () => {
    const a = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'PÃO DE AÇÚCAR',
    });
    const b = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'pao de acucar',
    });
    expect(a).toBe(b);
  });

  it('valor diferente → hash diferente', () => {
    const a = computeExternalHash({
      accountId: 'x',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'X',
    });
    const b = computeExternalHash({
      accountId: 'x',
      date: '2026-05-09',
      amountCents: -5001, // 1 centavo de diferença
      description: 'X',
    });
    expect(a).not.toBe(b);
  });

  it('conta diferente → hash diferente', () => {
    const a = computeExternalHash({
      accountId: 'itau',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'X',
    });
    const b = computeExternalHash({
      accountId: 'cora',
      date: '2026-05-09',
      amountCents: -5000,
      description: 'X',
    });
    expect(a).not.toBe(b);
  });
});

describe('detectInstallment', () => {
  it('PARC X/Y maiúsculas', () => {
    expect(detectInstallment('NOTEBOOK PARC 3/12')).toEqual({
      current: 3,
      total: 12,
    });
  });

  it('Parc X / Y com espaços', () => {
    expect(detectInstallment('Compra Parc 2 / 10')).toEqual({
      current: 2,
      total: 10,
    });
  });

  it('Parcela X de Y', () => {
    expect(detectInstallment('Compra Parcela 2 de 10')).toEqual({
      current: 2,
      total: 10,
    });
  });

  it('X DE Y maiúsculas (sem prefixo Parc)', () => {
    expect(detectInstallment('APPLE 1 DE 12')).toEqual({
      current: 1,
      total: 12,
    });
  });

  it('rejeita data 27/04 como parcela', () => {
    // total > 12 e current pode ser >= 12, mas precisamos rejeitar 27/04
    // (27 > 4 quebra current<=total). Caso classico de proteção.
    expect(detectInstallment('PIX TRANSF 27/04 ANA')).toBe(null);
  });

  it('rejeita 1/1 (parcela única)', () => {
    expect(detectInstallment('PARC 1/1')).toBe(null); // total >= 2
  });

  it('rejeita texto sem padrão', () => {
    expect(detectInstallment('UBER TRIP HELP')).toBe(null);
    expect(detectInstallment('Pão de Açúcar')).toBe(null);
  });

  it('rejeita total > 99', () => {
    expect(detectInstallment('Loan 1/100')).toBe(null);
  });

  it('rejeita current > total', () => {
    expect(detectInstallment('PARC 12/3')).toBe(null);
  });
});
