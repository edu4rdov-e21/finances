'use client';

import { useTransition } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { updateTransaction } from '@/lib/actions/transactions';
import { cn } from '@/lib/utils';
import type { CategoryRow } from '@/lib/accounts';
import type { TransactionRow } from '@/lib/transactions';

interface Props {
  row: TransactionRow;
  categories: CategoryRow[];
}

/**
 * Categoria editável inline. Vira um Select estilizado pra parecer célula
 * de tabela (sem borda, fundo transparente). Muda → revalidatePath na action
 * faz a tabela re-renderizar com o nome novo.
 *
 * Filtra categorias pelo "kind compatível": transação expense ou transfer_out
 * só aceita categorias expense; income ou transfer_in só income. Sem isso o
 * usuário poderia trocar "Mercado" por "Salário" — bagunça as listas.
 */
export function CategoryCell({ row, categories }: Props) {
  const [isPending, startTransition] = useTransition();

  const categoryKind: 'expense' | 'income' =
    row.kind === 'income' || row.kind === 'transfer_in' ? 'income' : 'expense';
  const compatible = categories.filter((c) => c.kind === categoryKind);

  function handleChange(newId: string) {
    if (newId === row.categoryId) return;
    startTransition(async () => {
      await updateTransaction({ id: row.id, categoryId: newId });
    });
  }

  return (
    <Select
      value={row.categoryId ?? ''}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger
        className={cn(
          'h-8 border-transparent bg-transparent px-2 text-sm text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus:bg-muted focus:text-foreground',
          isPending && 'opacity-50'
        )}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {compatible.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
