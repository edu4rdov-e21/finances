import type { ParsedRawTx } from './types';

/**
 * Parser CSV defensivo. Aceita formatos brasileiros típicos.
 *
 * Heurísticas:
 *  - Separador: detecta `;` ou `,` na primeira linha (cabeçalho)
 *  - Cabeçalho: identifica colunas por nomes comuns (case-insensitive,
 *    sem acentos, sem espaços)
 *  - Datas: DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD
 *  - Valores: "1.234,56" (BR) ou "1234.56" (US); aceita sinal de menos
 *    tradicional (-) e tipográfico (−, U+2212)
 *
 * Linhas malformadas são puladas silenciosamente — o usuário valida no
 * preview antes de confirmar importação.
 */

const DATE_NAMES = ['data', 'date'];
const DESC_NAMES = [
  'descricao',
  'descricao',
  'historico',
  'description',
  'history',
  'memo',
  'lancamento',
  'transacao',
];
const AMOUNT_NAMES = ['valor', 'value', 'amount', 'montante'];

export function parseCSV(content: string): ParsedRawTx[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0];
  const sep = detectSeparator(header);
  const cols = splitLine(header, sep).map((c) => normalizeHeader(c));

  const dateIdx = findIndex(cols, DATE_NAMES);
  const descIdx = findIndex(cols, DESC_NAMES);
  const amountIdx = findIndex(cols, AMOUNT_NAMES);

  if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) return [];

  const out: ParsedRawTx[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i], sep);
    if (fields.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;

    const date = parseDateString(fields[dateIdx]);
    const description = (fields[descIdx] ?? '').trim();
    const amountCents = parseAmountString(fields[amountIdx]);

    if (!date || !description || amountCents == null) continue;
    out.push({ date, description, amountCents });
  }
  return out;
}

function detectSeparator(headerLine: string): ';' | ',' {
  const semi = (headerLine.match(/;/g) ?? []).length;
  const comma = (headerLine.match(/,/g) ?? []).length;
  return semi > comma ? ';' : ',';
}

/**
 * Split simples por separador. Não suporta valores entre aspas (raro em
 * CSV de bancos brasileiros). Aspas retas são removidas dos campos.
 */
function splitLine(line: string, sep: ';' | ','): string[] {
  return line.split(sep).map((f) => f.trim().replace(/^"|"$/g, ''));
}

function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, ''); // remove espaços, hífens, símbolos
}

function findIndex(cols: string[], candidates: string[]): number {
  for (let i = 0; i < cols.length; i++) {
    if (candidates.some((c) => cols[i].includes(c))) return i;
  }
  return -1;
}

/**
 * Date parser. Suporta DD/MM/YYYY, DD/MM/YY e YYYY-MM-DD.
 * Retorna null se não bate nenhum formato.
 */
export function parseDateString(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) {
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      yyyy = String(century + Number(yyyy));
    }
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Amount parser. Heurística:
 *  - Se contém vírgula, formato BR: pontos são milhares, vírgula é decimal
 *  - Senão, formato US: ponto é decimal
 *  - Sinal de menos tipográfico (−, U+2212) é normalizado pra hífen
 *
 * Retorna centavos signed; null se não parseou.
 */
export function parseAmountString(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/−/g, '-');
  // remove tudo que não é dígito/sinal/separador
  const stripped = cleaned.replace(/[^\d.,\-+]/g, '');
  if (!stripped) return null;

  const normalized = stripped.includes(',')
    ? stripped.replace(/\./g, '').replace(',', '.')
    : stripped;

  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}
