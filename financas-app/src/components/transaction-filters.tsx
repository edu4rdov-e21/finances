'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

const ALL = '__all__';

interface Props {
  accounts: AccountRow[];
  categories: CategoryRow[];
}

export function TransactionFilters({ accounts, categories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Busca tem estado local pra não disparar fetch a cada tecla — debounce 300ms
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (searchInput === current) return;
    const t = setTimeout(() => {
      updateParams({ search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function clearAll() {
    setSearchInput('');
    startTransition(() => router.push(pathname));
  }

  const hasFilters = Array.from(searchParams.keys()).length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Descrição..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <FilterSelect
          label="Conta"
          value={searchParams.get('account') ?? ALL}
          onChange={(v) => updateParams({ account: v === ALL ? undefined : v })}
          options={[
            { value: ALL, label: 'Todas' },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />

        <FilterSelect
          label="Categoria"
          value={searchParams.get('category') ?? ALL}
          onChange={(v) => updateParams({ category: v === ALL ? undefined : v })}
          options={[
            { value: ALL, label: 'Todas' },
            ...categories.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.kind === 'expense' ? 'saída' : 'entrada'})`,
            })),
          ]}
        />

        <FilterSelect
          label="Tipo"
          value={searchParams.get('kind') ?? ALL}
          onChange={(v) => updateParams({ kind: v === ALL ? undefined : v })}
          options={[
            { value: ALL, label: 'Todos' },
            { value: 'expense', label: 'Saída' },
            { value: 'income', label: 'Entrada' },
            { value: 'transfer_out', label: 'Transferência (out)' },
            { value: 'transfer_in', label: 'Transferência (in)' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">De</Label>
          <Input
            id="from"
            type="date"
            value={searchParams.get('from') ?? ''}
            onChange={(e) =>
              updateParams({ from: e.target.value || undefined })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={searchParams.get('to') ?? ''}
            onChange={(e) =>
              updateParams({ to: e.target.value || undefined })
            }
          />
        </div>
        <div className="md:col-span-3 flex items-end justify-end">
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              type="button"
            >
              <X />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
