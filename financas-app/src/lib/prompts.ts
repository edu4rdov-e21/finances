/**
 * Templates de prompts pra Anthropic API.
 * Centralizado aqui pra fácil ajuste e versionamento.
 */

export const EXTRACT_TRANSACTIONS_SYSTEM = `Você extrai lançamentos de extratos bancários e faturas de cartão brasileiros. Retorne APENAS JSON válido, sem texto adicional, sem code fences, no formato exato:

{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string limpa",
      "amount_cents": número inteiro positivo,
      "kind": "expense" ou "income",
      "installment_info": null ou {"current": N, "total": M}
    }
  ]
}

Regras obrigatórias:
- amount_cents é SEMPRE positivo. O campo kind define se entra ou sai.
- Para faturas de cartão de crédito: todos os lançamentos são "expense" exceto estornos/créditos, que são "income".
- Para extratos de conta corrente: créditos/depósitos/Pix recebido = "income"; débitos/Pix enviado/saques = "expense".
- Limpe a descrição: remova códigos repetidos, datas redundantes no meio do texto, asteriscos isolados, prefixos como "PIX TRANSF" se redundantes. Mantenha o nome do estabelecimento legível.
- Detecte parcelas em padrões como "PARC X/Y", "X DE Y", "X/Y", "Parc X de Y". Preencha installment_info com {current, total}.
- Ignore linhas de saldo, totais, subtotais, taxas duplicadas com o lançamento principal.
- Se a data estiver em formato BR (DD/MM/YYYY), converta para ISO (YYYY-MM-DD).
- Use o ano do documento como contexto se a linha mostrar só DD/MM.

Retorne array vazio em "transactions" se não conseguir identificar lançamentos.`;

export const CATEGORIZE_SYSTEM = `Você categoriza despesas e receitas pessoais brasileiras. Receberá uma lista de categorias disponíveis e uma lista de descrições. Retorne APENAS JSON válido, sem texto adicional:

{
  "categorizations": [
    {"index": 0, "category_id": "...", "confidence": 0.0-1.0}
  ]
}

Regras:
- Use o id "outros" quando confidence < 0.6
- Confidence alta (>0.8) só pra matches óbvios (UBER → Transporte, IFOOD → Alimentação)
- Mantenha a ordem dos índices conforme recebida
- Não invente category_ids: use apenas os ids da lista fornecida`;

export interface CategorizationInput {
  index: number;
  description: string;
  amountCents: number;
  kind: 'expense' | 'income';
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: 'expense' | 'income';
}

export function buildCategorizeUserMessage(
  options: CategoryOption[],
  inputs: CategorizationInput[]
): string {
  const optionsList = options
    .map((c) => `- id: "${c.id}" | nome: ${c.name} | tipo: ${c.kind}`)
    .join('\n');

  const inputsList = inputs
    .map(
      (i) =>
        `${i.index}. ${i.description} (R$ ${(i.amountCents / 100).toFixed(2)}, ${i.kind})`
    )
    .join('\n');

  return `Categorias disponíveis:
${optionsList}

Descrições para categorizar (mantenha a ordem dos índices):
${inputsList}`;
}

/**
 * Modelo recomendado pra cada operação:
 * - PDF parsing: claude-sonnet-4-6 (precisa de leitura de documento + estrutura)
 * - Categorização: claude-haiku-4-5 (só texto, rápido e barato)
 */
export const MODELS = {
  pdfParser: 'claude-sonnet-4-6',
  categorizer: 'claude-haiku-4-5',
} as const;
