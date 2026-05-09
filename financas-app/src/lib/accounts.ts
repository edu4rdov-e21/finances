import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export type AccountRow = typeof schema.accounts.$inferSelect;
export type CategoryRow = typeof schema.categories.$inferSelect;

/** Contas não arquivadas, ordem alfabética. */
export function listAccounts(): AccountRow[] {
  return db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.archived, 0))
    .orderBy(schema.accounts.name)
    .all();
}

/**
 * Categorias não arquivadas. Filtra por kind se passado — útil pra modal
 * de novo lançamento mostrar só "expense" quando o tipo é saída.
 */
export function listCategories(
  kind?: 'expense' | 'income'
): CategoryRow[] {
  const where = kind
    ? and(eq(schema.categories.archived, 0), eq(schema.categories.kind, kind))
    : eq(schema.categories.archived, 0);
  return db
    .select()
    .from(schema.categories)
    .where(where)
    .orderBy(schema.categories.name)
    .all();
}
