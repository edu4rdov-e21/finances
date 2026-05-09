'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { parseBRL } from '@/lib/parse';
import {
  createTransaction,
  createTransfer,
} from '@/lib/actions/transactions';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

type FormKind = 'expense' | 'income' | 'transfer';
type FieldErrors = Record<string, string[] | undefined>;

interface Props {
  accounts: AccountRow[];
  categories: CategoryRow[];
}

export function NewTransactionDialog({ accounts, categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Novo lançamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
          <DialogDescription>
            Registre uma entrada, saída ou transferência entre contas.
          </DialogDescription>
        </DialogHeader>
        {/* Renderiza o form com `key={open}` pra resetar todo state interno
            ao abrir de novo — sem isso, valores antigos persistem entre aberturas. */}
        {open && (
          <TransactionForm
            accounts={accounts}
            categories={categories}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({
  accounts,
  categories,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [kind, setKind] = useState<FormKind>('expense');
  const [accountId, setAccountId] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredCategories =
    kind === 'transfer'
      ? []
      : categories.filter((c) => c.kind === kind);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const amountCents = parseBRL(amountInput);
    if (amountCents == null || amountCents <= 0) {
      setErrors({ amountCents: ['Informe um valor válido (ex: 1.234,56)'] });
      return;
    }

    startTransition(async () => {
      const result =
        kind === 'transfer'
          ? await createTransfer({
              fromAccountId,
              toAccountId,
              date,
              amountCents,
              description,
              notes: notes || null,
            })
          : await createTransaction({
              accountId,
              categoryId: categoryId || null,
              date,
              amountCents,
              kind,
              description,
              notes: notes || null,
            });

      if (result.ok) {
        onSuccess();
      } else {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) setFormError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <KindSelector value={kind} onChange={setKind} />

      {kind === 'transfer' ? (
        <div className="grid grid-cols-2 gap-4">
          <Field label="De" error={errors.fromAccountId}>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Conta de origem" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pra" error={errors.toAccountId}>
            <Select value={toAccountId} onValueChange={setToAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Conta de destino" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Conta" error={errors.accountId}>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Categoria" error={errors.categoryId}>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor" error={errors.amountCents}>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Data" error={errors.date}>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Descrição" error={errors.description}>
        <Input
          placeholder="Ex: Mercado da esquina"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Notas (opcional)" error={errors.notes}>
        <Input
          placeholder="Detalhes adicionais"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {formError && (
        <p className="text-sm text-negative" role="alert">
          {formError}
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isPending}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function KindSelector({
  value,
  onChange,
}: {
  value: FormKind;
  onChange: (k: FormKind) => void;
}) {
  const options: Array<{ key: FormKind; label: string }> = [
    { key: 'expense', label: 'Saída' },
    { key: 'income', label: 'Entrada' },
    { key: 'transfer', label: 'Transferência' },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && error.length > 0 && (
        <p className="text-xs text-negative" role="alert">
          {error[0]}
        </p>
      )}
    </div>
  );
}
