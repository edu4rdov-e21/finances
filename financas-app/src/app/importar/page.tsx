import { ImportForm } from '@/components/import-form';
import { listAccounts, listCategories } from '@/lib/accounts';

export default function ImportarPage() {
  const accounts = listAccounts();
  const categories = listCategories();
  return <ImportForm accounts={accounts} categories={categories} />;
}
