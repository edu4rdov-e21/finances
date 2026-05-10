import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('tabela básica com 3 transações mistas', () => {
    const md = `
| Data       | Descrição     | Valor   |
|------------|---------------|---------|
| 2026-05-01 | Pão de Açúcar | -87.50  |
| 2026-05-03 | UBER TRIP     | -23.50  |
| 2026-05-05 | Salário       | 5000.00 |
`;
    const result = parseMarkdown(md);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: '2026-05-01',
      description: 'Pão de Açúcar',
      amountCents: -8750,
    });
    expect(result[2].amountCents).toBe(500000);
  });

  it('aceita texto antes e depois da tabela', () => {
    const md = `Aqui está a tabela com as transações extraídas da fatura:

| Data | Descrição | Valor |
|------|-----------|-------|
| 2026-05-01 | UBER | -23.50 |

Total: 1 transação extraída. Para mais detalhes, me avise.
`;
    const result = parseMarkdown(md);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('UBER');
  });

  it('formato BR de valor (vírgula decimal) também aceita', () => {
    const md = `
| Data | Descrição | Valor |
|------|-----------|-------|
| 01/05/2026 | Mercado | -1.234,56 |
`;
    const result = parseMarkdown(md);
    expect(result).toEqual([
      { date: '2026-05-01', description: 'Mercado', amountCents: -123456 },
    ]);
  });

  it('pula linhas malformadas (menos de 3 colunas)', () => {
    const md = `
| Data | Descrição | Valor |
|------|-----------|-------|
| 2026-05-01 | OK | -100.00 |
| linha sem colunas |
| 2026-05-03 | Outra OK | 50.00 |
`;
    const result = parseMarkdown(md);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.description)).toEqual(['OK', 'Outra OK']);
  });

  it('pula linhas com data inválida', () => {
    const md = `
| Data | Descrição | Valor |
|------|-----------|-------|
| 2026-05-01 | OK | -100.00 |
| inválido | X | 50.00 |
| 2026-05-05 | OK2 | 30.00 |
`;
    const result = parseMarkdown(md);
    expect(result).toHaveLength(2);
  });

  it('arquivo sem tabela → array vazio', () => {
    expect(parseMarkdown('Apenas texto, sem tabela.')).toEqual([]);
    expect(parseMarkdown('')).toEqual([]);
  });

  it('aceita coluna extra (4ª coluna ignorada)', () => {
    const md = `
| Data | Descrição | Valor | Categoria |
|------|-----------|-------|-----------|
| 2026-05-01 | UBER | -23.50 | Transporte |
`;
    const result = parseMarkdown(md);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('UBER');
  });

  it('header em português ou inglês não importa — só posição conta', () => {
    const md1 = `
| Date | Description | Amount |
|------|-------------|--------|
| 2026-05-01 | Coffee | -5.00 |
`;
    expect(parseMarkdown(md1)).toEqual([
      { date: '2026-05-01', description: 'Coffee', amountCents: -500 },
    ]);
  });
});
