/**
 * Saída comum dos parsers (CSV, OFX, PDF na Etapa 8).
 *
 * - date em ISO (YYYY-MM-DD)
 * - description bruta — normalização (lowercase, remove códigos) acontece
 *   no pipeline de import.ts, NÃO no parser
 * - amountCents signed: positivo = entrada, negativo = saída
 */
export type ParsedRawTx = {
  date: string;
  description: string;
  amountCents: number;
};
