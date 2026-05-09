/**
 * Parsers de input do usuário. Centavos é a moeda interna do app inteiro.
 */

/**
 * "R$ 1.234,56" → 123456
 * "1.234,56"    → 123456
 * "1234,56"     → 123456
 * "1234"        → 123400  (centavos zerados)
 * "12,3"        → 1230
 * "abc"         → null
 * ""            → null
 */
export function parseBRL(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[^\d,.-]/g, '') // remove R$, espaços, letras
    .replace(/\./g, '') // remove pontos (separador de milhar BR)
    .replace(',', '.'); // troca vírgula decimal por ponto

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  // Multiplicar por 100 e arredondar evita drift de float ("12.3 * 100 = 1229.9999...")
  return Math.round(num * 100);
}
