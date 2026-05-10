import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export type AccountRow = typeof schema.accounts.$inferSelect;
export type CategoryRow = typeof schema.categories.$inferSelect;

/** Contas não arquivadas do workspace, ordem alfabética. */
export async function listAccounts(workspaceId: string): Promise<AccountRow[]> {
  return await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.archived, 0)
      )
    )
    .orderBy(schema.accounts.name);
}

/**
 * Categorias não arquivadas do workspace. Filtra por kind se passado — útil
 * pra modal de novo lançamento mostrar só "expense" quando o tipo é saída.
 */
export async function listCategories(
  workspaceId: string,
  kind?: 'expense' | 'income'
): Promise<CategoryRow[]> {
  const conditions = [
    eq(schema.categories.workspaceId, workspaceId),
    eq(schema.categories.archived, 0),
  ];
  if (kind) conditions.push(eq(schema.categories.kind, kind));
  return await db
    .select()
    .from(schema.categories)
    .where(and(...conditions))
    .orderBy(schema.categories.name);
}
