import type { ParsedRawTx } from './types';

/**
 * Parser OFX (Open Financial Exchange) — formato XML/SGML usado por bancos.
 *
 * Estratégia: regex pra extrair blocos `<STMTTRN>...</STMTTRN>` e dentro
 * de cada um pegar `<DTPOSTED>`, `<TRNAMT>`, `<MEMO>` ou `<NAME>`.
 *
 * Não validamos contra a DTD/Schema OFX — alguns bancos brasileiros geram
 * OFX um pouco fora do padrão. Regex tolera melhor que parser XML estrito.
 */
export function parseOFX(content: string): ParsedRawTx[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const out: ParsedRawTx[] = [];

  for (const block of blocks) {
    const date = parseOFXDate(getTag(block, 'DTPOSTED'));
    const amountCents = parseOFXAmount(getTag(block, 'TRNAMT'));
    const memo = getTag(block, 'MEMO') ?? getTag(block, 'NAME') ?? '';
    const description = memo.trim();

    if (!date || amountCents == null || !description) continue;
    out.push({ date, description, amountCents });
  }

  return out;
}

function getTag(block: string, tag: string): string | null {
  // OFX permite tags sem fechamento explícito (<TAG>valor\n próxima tag).
  // O regex captura até o próximo `<` ou fim da linha — funciona pros dois.
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** OFX date: YYYYMMDDHHMMSS, YYYYMMDD, ou YYYYMMDD[hhmmss.sss[XYZ]] */
export function parseOFXDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** OFX TRNAMT: sempre formato US (ponto decimal), pode ter sinal. */
export function parseOFXAmount(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}
