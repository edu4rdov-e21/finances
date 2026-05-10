import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  computeProjection,
  type HypotheticalTx,
  type ProjectionAccount,
  type ProjectionResult,
  type ProjectionTx,
} from './projection-compute';

// Re-exporta tudo de projection-compute. Client components importam
// diretamente de '@/lib/projection-compute' pra evitar arrastar db no bundle.
export * from './projection-compute';

/**
 * Toca o banco e chama computeProjection. Server-only.
 */
export async function getProjectedBalance(
  workspaceId: string,
  opts: {
    monthsAhead?: number;
    hypothetical?: HypotheticalTx[];
    now?: Date;
  } = {}
): Promise<ProjectionResult> {
  const accounts: ProjectionAccount[] = await db
    .select({
      id: schema.accounts.id,
      initialBalance: schema.accounts.initialBalance,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.workspaceId, workspaceId),
        eq(schema.accounts.archived, 0)
      )
    );

  const transactions: ProjectionTx[] = await db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));

  return computeProjection({ ...opts, accounts, transactions });
}
