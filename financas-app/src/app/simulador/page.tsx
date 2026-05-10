import { eq } from 'drizzle-orm';
import { Simulator } from '@/components/simulator';
import { listAccounts, listCategories } from '@/lib/accounts';
import { getMinimumReserve } from '@/lib/reserve';
import { ensureRecurringGenerated } from '@/lib/boot';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import { db, schema } from '@/db/client';
import type {
  ProjectionAccount,
  ProjectionTx,
} from '@/lib/projection-compute';

export default async function SimuladorPage() {
  const workspaceId = await requireActiveWorkspaceId();
  await ensureRecurringGenerated(workspaceId);

  const [accounts, categories, reserve] = await Promise.all([
    listAccounts(workspaceId),
    listCategories(workspaceId, 'expense'),
    getMinimumReserve(workspaceId),
  ]);

  const projectionAccounts: ProjectionAccount[] = accounts.map((a) => ({
    id: a.id,
    initialBalance: a.initialBalance,
    kind: a.kind,
  }));

  const allTransactions: ProjectionTx[] = await db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.workspaceId, workspaceId));

  return (
    <Simulator
      accounts={accounts}
      categories={categories}
      reserve={reserve}
      projectionAccounts={projectionAccounts}
      allTransactions={allTransactions}
    />
  );
}
