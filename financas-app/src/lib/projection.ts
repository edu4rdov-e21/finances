import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import {
  computeProjection,
  type HypotheticalTx,
  type Ownership,
  type ProjectionAccount,
  type ProjectionResult,
  type ProjectionTx,
} from './projection-compute';

// Re-exporta tudo de projection-compute pra retrocompatibilidade — quem
// importa de '@/lib/projection' continua funcionando. CLIENT components
// devem importar diretamente de '@/lib/projection-compute' pra evitar
// arrastar `db` no bundle.
export * from './projection-compute';

/**
 * Toca o banco e chama computeProjection. Server-only.
 */
export function getProjectedBalance(
  opts: {
    monthsAhead?: number;
    ownership?: Ownership;
    hypothetical?: HypotheticalTx[];
    now?: Date;
  } = {}
): ProjectionResult {
  const accounts: ProjectionAccount[] = db
    .select({
      id: schema.accounts.id,
      initialBalance: schema.accounts.initialBalance,
      ownership: schema.accounts.ownership,
      kind: schema.accounts.kind,
    })
    .from(schema.accounts)
    .where(eq(schema.accounts.archived, 0))
    .all();

  const transactions: ProjectionTx[] = db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
    })
    .from(schema.transactions)
    .all();

  return computeProjection({ ...opts, accounts, transactions });
}
