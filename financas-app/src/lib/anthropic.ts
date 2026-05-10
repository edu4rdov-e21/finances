import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  MODELS,
  EXTRACT_TRANSACTIONS_SYSTEM,
  CATEGORIZE_SYSTEM,
  buildCategorizeUserMessage,
  type CategorizationInput,
  type CategoryOption,
} from './prompts';
import type { ParsedRawTx } from './parsers/types';

/**
 * Cliente Anthropic. Server-only (a key nunca pode vazar pro client).
 *
 * Se a key não estiver configurada, joga erro humano — Server Action pega
 * e devolve mensagem clara pro usuário.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      'ANTHROPIC_API_KEY não configurada. Cole a key em .env.local pra habilitar importação de PDF e categorização automática.'
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

// Schemas Zod do output esperado da LLM. Servem como contrato + validação
// em runtime. LLM pode "alucinar" estrutura — aqui é onde detectamos.

const ExtractTxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  kind: z.enum(['expense', 'income']),
  installment_info: z
    .object({
      current: z.number().int().positive(),
      total: z.number().int().positive(),
    })
    .nullable()
    .optional(),
});

const ExtractResponseSchema = z.object({
  transactions: z.array(ExtractTxSchema),
});

const CategorizationItemSchema = z.object({
  index: z.number().int().nonnegative(),
  category_id: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const CategorizationResponseSchema = z.object({
  categorizations: z.array(CategorizationItemSchema),
});

/**
 * Extrai JSON de uma string que pode ter prefixo, code fence, ou texto extra.
 * Função pura — testável.
 */
export function extractJSON(text: string): unknown | null {
  // Tentativa 1: JSON puro
  try {
    return JSON.parse(text);
  } catch {
    /* tenta próximo */
  }

  // Tentativa 2: code fence ```json ... ``` ou ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* tenta próximo */
    }
  }

  // Tentativa 3: primeiro objeto entre {...} (greedy outer)
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* nada */
    }
  }

  return null;
}

const MIN_CATEGORIZATION_CONFIDENCE = 0.6;

/**
 * Lê PDF (base64) e devolve transações estruturadas.
 *
 * Note: o `kind` vem da LLM como 'expense' | 'income'; convertemos pra
 * `amountCents` signed (parser CSV/OFX usa signed; consistência).
 */
export async function parsePDFToTransactions(
  pdfBase64: string
): Promise<ParsedRawTx[]> {
  const c = getClient();

  const response = await c.messages.create({
    model: MODELS.pdfParser,
    max_tokens: 16384, // fatura grande pode passar de 4k de JSON
    system: EXTRACT_TRANSACTIONS_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: 'Extraia todas as transações deste arquivo no formato JSON especificado.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('LLM não retornou texto');
  }

  const parsed = extractJSON(textBlock.text);
  if (!parsed) {
    throw new Error(
      `LLM retornou conteúdo que não é JSON parseável (stop_reason: ${response.stop_reason}, length: ${textBlock.text.length})`
    );
  }

  const validated = ExtractResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      'LLM retornou JSON com formato inesperado: ' +
        validated.error.issues[0]?.message
    );
  }

  return validated.data.transactions.map((tx) => ({
    date: tx.date,
    description: tx.description,
    // Converte unsigned (LLM format) → signed (parser format)
    amountCents: tx.kind === 'expense' ? -tx.amount_cents : tx.amount_cents,
  }));
}

/**
 * Categoriza uma lista de descrições contra uma lista de categorias.
 * Retorna Map indexado pelo `index` original. Sugestões com confidence
 * abaixo do threshold ou category_id inválido são silenciosamente filtradas.
 */
export async function categorizeBatch(opts: {
  items: CategorizationInput[];
  categories: CategoryOption[];
}): Promise<Map<number, { categoryId: string; confidence: number }>> {
  if (opts.items.length === 0 || opts.categories.length === 0) {
    return new Map();
  }

  const c = getClient();
  const userMessage = buildCategorizeUserMessage(
    opts.categories,
    opts.items
  );

  const response = await c.messages.create({
    model: MODELS.categorizer,
    max_tokens: 4096,
    system: CATEGORIZE_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return new Map();

  const parsed = extractJSON(textBlock.text);
  if (!parsed) return new Map();

  const validated = CategorizationResponseSchema.safeParse(parsed);
  if (!validated.success) return new Map();

  const validIds = new Set(opts.categories.map((c) => c.id));
  const out = new Map<
    number,
    { categoryId: string; confidence: number }
  >();
  for (const cat of validated.data.categorizations) {
    if (cat.confidence < MIN_CATEGORIZATION_CONFIDENCE) continue;
    if (!validIds.has(cat.category_id)) continue;
    out.set(cat.index, {
      categoryId: cat.category_id,
      confidence: cat.confidence,
    });
  }

  return out;
}
