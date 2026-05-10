import { describe, it, expect } from 'vitest';
import { nextOccurrences } from './recurring';

const ref = (s: string) => new Date(s);

describe('nextOccurrences', () => {
  it('aluguel mensal padrão (dia 5, hoje 9/mai)', () => {
    const occurrences = nextOccurrences(
      { dayOfMonth: 5, startDate: '2026-01-01', endDate: null },
      12,
      ref('2026-05-09')
    );
    expect(occurrences).toHaveLength(12);
    expect(occurrences[0]).toBe('2026-05-05');
    expect(occurrences[11]).toBe('2027-04-05');
  });

  it('dia 31 em fevereiro vira 28 (ano não bissexto)', () => {
    const occurrences = nextOccurrences(
      { dayOfMonth: 31, startDate: '2026-01-01', endDate: null },
      4,
      ref('2026-01-15')
    );
    expect(occurrences).toEqual([
      '2026-01-31',
      '2026-02-28', // fev clamp
      '2026-03-31',
      '2026-04-30', // abril clamp
    ]);
  });

  it('respeita endDate (para quando ultrapassa)', () => {
    const occurrences = nextOccurrences(
      {
        dayOfMonth: 5,
        startDate: '2026-05-01',
        endDate: '2026-07-31',
      },
      12,
      ref('2026-05-09')
    );
    expect(occurrences).toEqual(['2026-05-05', '2026-06-05', '2026-07-05']);
  });

  it('startDate no futuro (regra começa daqui a 3 meses)', () => {
    // Bug histórico: quando dayOfMonth caía ANTES do startDate dentro do mês
    // de start, perdia uma ocorrência. O fix garante que o loop continue até
    // acumular monthsAhead ocorrências.
    const occurrences = nextOccurrences(
      { dayOfMonth: 10, startDate: '2026-08-15', endDate: null },
      12,
      ref('2026-05-09')
    );
    expect(occurrences).toHaveLength(12);
    expect(occurrences[0]).toBe('2026-09-10'); // pula ago/10 (antes do startDate)
  });

  it('inclui ocorrência do mês corrente mesmo se o dia já passou', () => {
    // Decisão intencional (Etapa 3.1): o usuário pode ter esquecido de
    // marcar uma recorrência cujo dia caiu no início do mês — então a
    // ocorrência do mês corrente é gerada como pending pra ele confirmar.
    const occurrences = nextOccurrences(
      { dayOfMonth: 1, startDate: '2026-01-01', endDate: null },
      3,
      ref('2026-05-15')
    );
    expect(occurrences).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
  });
});
