import { describe, it, expect } from 'vitest';
import { extractJSON } from './anthropic';

describe('extractJSON', () => {
  it('JSON puro', () => {
    expect(extractJSON('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
  });

  it('JSON puro com whitespace', () => {
    expect(extractJSON('  \n  {"a":1}\n  ')).toEqual({ a: 1 });
  });

  it('JSON em code fence ```json', () => {
    const text = '```json\n{"transactions":[]}\n```';
    expect(extractJSON(text)).toEqual({ transactions: [] });
  });

  it('JSON em code fence sem language tag', () => {
    const text = '```\n{"a":1}\n```';
    expect(extractJSON(text)).toEqual({ a: 1 });
  });

  it('JSON com prefixo de texto', () => {
    const text =
      'Aqui está o JSON solicitado:\n{"transactions":[{"date":"2026-05-09","description":"X","amount_cents":1000,"kind":"expense"}]}';
    const result = extractJSON(text) as {
      transactions: Array<{ description: string }>;
    };
    expect(result.transactions[0].description).toBe('X');
  });

  it('JSON com texto antes E depois', () => {
    const text =
      'Sure, here you go:\n{"a":1}\n\nNote: only one entry was found.';
    expect(extractJSON(text)).toEqual({ a: 1 });
  });

  it('JSON inválido → null', () => {
    expect(extractJSON('{ broken json}')).toBe(null);
  });

  it('texto sem JSON → null', () => {
    expect(extractJSON('No transactions found in this document.')).toBe(null);
  });

  it('string vazia → null', () => {
    expect(extractJSON('')).toBe(null);
  });

  it('JSON aninhado complexo', () => {
    const text = `\`\`\`json
{
  "transactions": [
    {
      "date": "2026-05-09",
      "description": "UBER",
      "amount_cents": 2350,
      "kind": "expense",
      "installment_info": null
    },
    {
      "date": "2026-05-10",
      "description": "Apple",
      "amount_cents": 99999,
      "kind": "expense",
      "installment_info": { "current": 1, "total": 12 }
    }
  ]
}
\`\`\``;
    const result = extractJSON(text) as {
      transactions: Array<{ description: string }>;
    };
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[1].description).toBe('Apple');
  });
});
