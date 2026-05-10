import { describe, it, expect } from 'vitest';
import { parseCSV, parseAmountString, parseDateString } from './csv';

describe('parseAmountString', () => {
  it('formato BR: 1.234,56 → 123456', () => {
    expect(parseAmountString('1.234,56')).toBe(123456);
  });

  it('formato US: 1234.56 → 123456', () => {
    expect(parseAmountString('1234.56')).toBe(123456);
  });

  it('valor negativo (hífen ASCII)', () => {
    expect(parseAmountString('-150,00')).toBe(-15000);
  });

  it('valor negativo (minus tipográfico U+2212)', () => {
    expect(parseAmountString('−150,00')).toBe(-15000);
  });

  it('valor com R$ e espaço', () => {
    expect(parseAmountString('R$ 1.234,56')).toBe(123456);
  });

  it('valor zero', () => {
    expect(parseAmountString('0,00')).toBe(0);
  });

  it('vazio → null', () => {
    expect(parseAmountString('')).toBe(null);
    expect(parseAmountString('   ')).toBe(null);
  });

  it('texto puro → null', () => {
    expect(parseAmountString('xyz')).toBe(null);
  });
});

describe('parseDateString', () => {
  it('DD/MM/YYYY', () => {
    expect(parseDateString('01/05/2026')).toBe('2026-05-01');
  });

  it('D/M/YYYY (single digit)', () => {
    expect(parseDateString('1/5/2026')).toBe('2026-05-01');
  });

  it('DD/MM/YY (2 digit year, assume current century)', () => {
    expect(parseDateString('01/05/26')).toBe('2026-05-01');
  });

  it('YYYY-MM-DD (already ISO)', () => {
    expect(parseDateString('2026-05-01')).toBe('2026-05-01');
  });

  it('formato desconhecido → null', () => {
    expect(parseDateString('05.01.2026')).toBe(null);
    expect(parseDateString('hoje')).toBe(null);
  });
});

describe('parseCSV', () => {
  it('CSV BR com ponto-e-vírgula', () => {
    const content = `Data;Descrição;Valor
01/05/2026;Pagamento boleto;-150,00
03/05/2026;PIX recebido;500,00`;
    const result = parseCSV(content);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2026-05-01',
      description: 'Pagamento boleto',
      amountCents: -15000,
    });
    expect(result[1]).toEqual({
      date: '2026-05-03',
      description: 'PIX recebido',
      amountCents: 50000,
    });
  });

  it('CSV US com vírgula', () => {
    const content = `Date,Description,Amount
2026-05-01,Pagamento,-150.00
2026-05-03,Recebimento,500.00`;
    const result = parseCSV(content);
    expect(result).toHaveLength(2);
    expect(result[0].amountCents).toBe(-15000);
  });

  it('cabeçalhos com acentos e variações', () => {
    const content = `data;histórico;valor
01/05/2026;Pão;−10,00`;
    const result = parseCSV(content);
    expect(result).toHaveLength(1);
    expect(result[0].amountCents).toBe(-1000);
  });

  it('linhas malformadas são puladas silenciosamente', () => {
    const content = `Data;Descricao;Valor
01/05/2026;OK;-100,00
linha_quebrada
;;;
05/05/2026;Outra OK;200,00
data_invalida;X;100,00`;
    const result = parseCSV(content);
    // OK + Outra OK = 2 (data_invalida pula porque "data_invalida" não é date válida)
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.description)).toEqual(['OK', 'Outra OK']);
  });

  it('arquivo sem cabeçalho identificável → array vazio', () => {
    const content = `xyz;abc;def
01/05/2026;a;100,00`;
    expect(parseCSV(content)).toEqual([]);
  });

  it('arquivo com 1 linha só → vazio', () => {
    expect(parseCSV('Data;Descricao;Valor')).toEqual([]);
  });

  it('arquivo vazio → vazio', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('CRLF (Windows) também funciona', () => {
    const content = `Data;Descricao;Valor\r\n01/05/2026;X;-100,00\r\n`;
    expect(parseCSV(content)).toHaveLength(1);
  });
});
