import { z } from 'zod';
import { and, desc, eq, gte, lte, like, type SQL } from 'drizzle-orm';
import { db, schema } from '@/db/client';

/**
 * Schemas de input.
 *
 * Princípio §13: validar no boundary. As Server Actions chamam .parse() e,
 * se algo vier errado, o código de baixo trata Zod errors como erro de UI.
 * Se passar, daqui pra dentro tudo é confiável.
 */

const TX_KIND = z.enum(['expense', 'income', 'transfer_out', 'transfer_in']);
const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em formato YYYY-MM-DD');

export const createTransactionSchema = z.object({
  accountId: z.string().min(1, 'Conta obrigatória'),
  categoryId: z.string().min(1).nullable(),
  date: ISO_DATE,
  amountCents: z
    .number()
    .int('Valor deve ser inteiro (centavos)')
    .positive('Valor deve ser positivo'),
  kind: TX_KIND,
  description: z.string().trim().min(1, 'Descrição obrigatória').max(200),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.string().min(1),
});

/**
 * Transferência entre contas. Refine garante que origem ≠ destino — caso
 * raro mas possível e que geraria dois lançamentos sem efeito real.
 */
export const createTransferSchema = z
  .object({
    fromAccountId: z.string().min(1, 'Conta de origem obrigatória'),
    toAccountId: z.string().min(1, 'Conta de destino obrigatória'),
    date: ISO_DATE,
    amountCents: z.number().int().positive('Valor deve ser positivo'),
    description: z.string().trim().min(1, 'Descrição obrigatória').max(200),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: 'Origem e destino devem ser contas diferentes',
    path: ['toAccountId'],
  });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/**
 * Filtros opcionais pra listagem. Vem dos search params da URL e por isso
 * todo campo é opcional. `.catch({})` no parse silencia inputs malformados —
 * URL pode ter qualquer coisa que o usuário digitou e não queremos quebrar.
 */
export const transactionFiltersSchema = z
  .object({
    account: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    kind: TX_KIND.optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .catch({});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

/**
 * Listagem com JOIN. Devolve nome da conta e categoria já resolvidos
 * (sem precisar de mais uma query no client).
 *
 * Ordenação: data desc, depois createdAt desc — empate de data fica em
 * ordem de inserção mais recente.
 */
export type TransactionRow = {
  id: string;
  date: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  description: string;
  notes: string | null;
  status: 'confirmed' | 'pending';
  accountId: string;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export function listTransactions(
  filters: TransactionFilters = {}
): TransactionRow[] {
  // Constrói condições WHERE só pros filtros presentes. Filtros undefined
  // não entram no SQL — listagem sem filtro vira SELECT sem WHERE.
  const conds: SQL[] = [];
  if (filters.account)
    conds.push(eq(schema.transactions.accountId, filters.account));
  if (filters.category)
    conds.push(eq(schema.transactions.categoryId, filters.category));
  if (filters.kind) conds.push(eq(schema.transactions.kind, filters.kind));
  if (filters.from) conds.push(gte(schema.transactions.date, filters.from));
  if (filters.to) conds.push(lte(schema.transactions.date, filters.to));
  if (filters.search)
    conds.push(like(schema.transactions.description, `%${filters.search}%`));

  const where = conds.length > 0 ? and(...conds) : undefined;

  return db
    .select({
      id: schema.transactions.id,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
      description: schema.transactions.description,
      notes: schema.transactions.notes,
      status: schema.transactions.status,
      accountId: schema.transactions.accountId,
      accountName: schema.accounts.name,
      categoryId: schema.transactions.categoryId,
      categoryName: schema.categories.name,
    })
    .from(schema.transactions)
    .leftJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .leftJoin(
      schema.categories,
      eq(schema.transactions.categoryId, schema.categories.id)
    )
    .where(where)
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
    .all();
}

export function getTransactionById(id: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();
}

/**
 * A spec pré-cadastra "Transferência" como categoria em expense E income
 * (kinds duplicados, com mesmo nome). Helper pra recuperar o id certo pro
 * lado da transferência (out usa expense, in usa income).
 */
export function getTransferCategory(kind: 'expense' | 'income') {
  return db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.name, 'Transferência'),
        eq(schema.categories.kind, kind)
      )
    )
    .get();
}
