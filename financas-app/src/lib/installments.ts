/**
 * Distribuição de centavos em parcelas. Função pura, sem dependência de banco.
 * Vive em arquivo separado pra ser importável em Client Components (preview
 * em tempo real do valor das parcelas enquanto o usuário digita).
 */

export function distributeInstallments(
  totalCents: number,
  n: number
): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents deve ser inteiro não-negativo');
  }
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('Número de parcelas deve ser inteiro >= 1');
  }
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? base + remainder : base
  );
}
