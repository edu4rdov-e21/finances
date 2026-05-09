import { generateRecurringTransactions } from './recurring';

const THROTTLE_MS = 60_000; // 1 minuto

let lastRunMs = 0;

/**
 * Garante que recorrências estejam materializadas pros próximos 12 meses.
 *
 * - Idempotente: o job interno verifica antes de inserir (segurança).
 * - Throttled: executa no máximo 1× por minuto (eficiência).
 *
 * Pode ser chamado livremente no início de qualquer Server Component sem
 * se preocupar com performance. A primeira visita dispara; as N seguintes
 * dentro da janela viram no-op.
 */
export function ensureRecurringGenerated(): void {
  const now = Date.now();
  if (now - lastRunMs < THROTTLE_MS) return;
  lastRunMs = now;

  try {
    generateRecurringTransactions();
  } catch (err) {
    // Falha silenciosa — geração não é crítica pra render da página atual.
    // Próxima visita após THROTTLE_MS tenta de novo.
    console.error('[ensureRecurringGenerated] failed:', err);
  }
}
