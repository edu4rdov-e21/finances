/**
 * Formatadores compartilhados.
 * Regra de ouro: backend sempre em centavos, conversão só aqui.
 */

/** Centavos → "R$ 1.234,56". Aceita negativo (vai com sinal). */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** ISO date "YYYY-MM-DD" → "09/05/26" (denso, padrão BR) */
export function formatDateShort(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year.slice(2)}`;
}

/**
 * Pra tabela de lançamentos: combina sinal (+/-) com cor semântica.
 * - income / transfer_in → positivo (verde)
 * - expense → negativo (rosé-tijolo)
 * - transfer_out → negativo, mas em neutro (caramelo) — visualmente sinaliza
 *   que é movimentação interna, não despesa real
 */
export function formatTxAmount(
  amountCents: number,
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in'
): { display: string; tone: 'positive' | 'negative' | 'neutral' } {
  const isInflow = kind === 'income' || kind === 'transfer_in';
  const isTransfer = kind === 'transfer_out' || kind === 'transfer_in';
  const sign = isInflow ? '+' : '−'; // U+2212, minus sign tipográfico
  const display = `${sign}${formatBRL(amountCents)}`;
  const tone: 'positive' | 'negative' | 'neutral' = isTransfer
    ? 'neutral'
    : isInflow
    ? 'positive'
    : 'negative';
  return { display, tone };
}
