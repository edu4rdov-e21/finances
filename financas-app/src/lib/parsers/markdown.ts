import type { ParsedRawTx } from './types';
import { parseAmountString, parseDateString } from './csv';

/**
 * Parser Markdown — formato tabela pipe-delimited.
 *
 * Espera o formato gerado pelo prompt fornecido em /importar (botão "Copiar
 * prompt pra Claude.ai"). Reaproveita os helpers de CSV pra parse de data e
 * valor.
 *
 * Formato esperado:
 *
 *     | Data       | Descrição     | Valor   |
 *     |------------|---------------|---------|
 *     | 2026-05-01 | Pão de Açúcar | -87.50  |
 *     | 2026-05-03 | UBER          | -23.50  |
 *     | 2026-05-05 | Salário       | 5000.00 |
 *
 * Defensivo:
 *  - Detecta tabela mesmo com texto antes/depois (Claude pode adicionar
 *    "Aqui está a tabela:" no começo)
 *  - Tolera espaçamento variado nas células
 *  - Pula a linha separadora `|---|---|---|`
 *  - Pula linhas que não tem 3 colunas válidas
 */
export function parseMarkdown(content: string): ParsedRawTx[] {
  const lines = content.split(/\r?\n/);
  const tableLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableLines.push(trimmed);
      inTable = true;
    } else if (inTable && trimmed === '') {
      // linha vazia depois da tabela — termina (mas continua se voltar tabela)
      inTable = false;
    }
  }

  if (tableLines.length < 2) return []; // header + separator no mínimo

  const out: ParsedRawTx[] = [];

  for (const line of tableLines) {
    // Separator row: "|---|---|---|"
    if (/^\|[\s|:-]+\|$/.test(line)) continue;

    const cells = splitCells(line);
    if (cells.length < 3) continue;

    // Heurística de header: se a 3ª célula não parsea como valor, é header
    if (parseAmountString(cells[2]) == null) continue;

    const date = parseDateString(cells[0]);
    const description = cells[1];
    const amountCents = parseAmountString(cells[2]);

    if (!date || !description || amountCents == null) continue;

    out.push({ date, description, amountCents });
  }

  return out;
}

function splitCells(line: string): string[] {
  // "| a | b | c |" → ["a", "b", "c"]
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}
