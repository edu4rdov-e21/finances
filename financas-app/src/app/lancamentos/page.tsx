import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  listTransactions,
  transactionFiltersSchema,
} from '@/lib/transactions';
import { listAccounts, listCategories } from '@/lib/accounts';
import { formatDateShort, formatTxAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { NewTransactionDialog } from '@/components/new-transaction-dialog';
import { TransactionFilters } from '@/components/transaction-filters';
import { CategoryCell } from '@/components/category-cell';
import { DeleteTransactionButton } from '@/components/delete-transaction-button';
import { buttonVariants } from '@/components/ui/button';
import { ensureRecurringGenerated } from '@/lib/boot';
import { requireActiveWorkspaceId } from '@/lib/workspace';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const workspaceId = await requireActiveWorkspaceId();
  await ensureRecurringGenerated(workspaceId);

  const raw = await searchParams;
  const filters = transactionFiltersSchema.parse(raw);

  const [rows, accounts, categories] = await Promise.all([
    listTransactions(workspaceId, filters),
    listAccounts(workspaceId),
    listCategories(workspaceId),
  ]);

  const hasFiltersApplied = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Lançamentos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toda entrada e saída registrada no app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/importar"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Upload />
            Importar extrato
          </Link>
          <NewTransactionDialog accounts={accounts} categories={categories} />
        </div>
      </div>

      <TransactionFilters accounts={accounts} categories={categories} />

      {rows.length === 0 ? (
        <EmptyState filtered={hasFiltersApplied} />
      ) : (
        <div className="rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const { display, tone } = formatTxAmount(row.amount, row.kind);
                return (
                  <TableRow key={row.id} className="group">
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDateShort(row.date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.description}
                      {row.status === 'pending' && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          pendente
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.accountName ?? '—'}
                    </TableCell>
                    <TableCell className="p-2">
                      <CategoryCell row={row} categories={categories} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        tone === 'positive' && 'text-positive',
                        tone === 'negative' && 'text-negative',
                        tone === 'neutral' && 'text-neutral'
                      )}
                    >
                      {display}
                    </TableCell>
                    <TableCell className="p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <DeleteTransactionButton
                        id={row.id}
                        description={row.description}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface py-20 text-center">
      <p className="text-sm text-foreground">
        {filtered
          ? 'Nenhum lançamento bate com esses filtros.'
          : 'Nenhum lançamento ainda.'}
      </p>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        {filtered
          ? 'Limpe os filtros pra ver tudo.'
          : 'Use o botão "Novo lançamento" pra registrar a primeira entrada, saída ou transferência.'}
      </p>
    </div>
  );
}
