import { Simulator } from '@/components/simulator';
import { listAccounts, listCategories } from '@/lib/accounts';
import { getMinimumReserve } from '@/lib/reserve';
import { ensureRecurringGenerated } from '@/lib/boot';
import { db, schema } from '@/db/client';
import type { ProjectionAccount, ProjectionTx } from '@/lib/projection';

export default function SimuladorPage() {
  ensureRecurringGenerated();

  const accounts = listAccounts();
  const categories = listCategories('expense');
  const reserve = getMinimumReserve();

  // Mapeia pra forma compacta esperada por computeProjection
  const projectionAccounts: ProjectionAccount[] = accounts.map((a) => ({
    id: a.id,
    initialBalance: a.initialBalance,
    ownership: a.ownership,
    kind: a.kind,
  }));

  // Carrega TODAS transactions (pra MVP — single user, volume baixo)
  const allTransactions: ProjectionTx[] = db
    .select({
      accountId: schema.transactions.accountId,
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      kind: schema.transactions.kind,
    })
    .from(schema.transactions)
    .all();

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
