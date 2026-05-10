import { ImportForm } from '@/components/import-form';
import { listAccounts, listCategories } from '@/lib/accounts';
import { requireActiveWorkspaceId } from '@/lib/workspace';

export default async function ImportarPage() {
  const workspaceId = await requireActiveWorkspaceId();
  const [accounts, categories] = await Promise.all([
    listAccounts(workspaceId),
    listCategories(workspaceId),
  ]);
  return <ImportForm accounts={accounts} categories={categories} />;
}
