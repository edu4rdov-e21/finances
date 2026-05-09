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
import { createRecurringRule } from '@/lib/actions/recurring';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

type Kind = 'expense' | 'income';
type FieldErrors = Record<string, string[] | undefined>;

interface Props {
  accounts: AccountRow[];
  categories: CategoryRow[];
}

export function NewRecurringRuleDialog({ accounts, categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nova recorrência
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova recorrência</DialogTitle>
          <DialogDescription>
            Regra mensal — gera lançamentos pendentes pros próximos 12 meses.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Form
            accounts={accounts}
            categories={categories}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  accounts,
  categories,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [kind, setKind] = useState<Kind>('expense');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredCategories = categories.filter((c) => c.kind === kind);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const amount = parseBRL(amountInput);
    if (amount == null || amount <= 0) {
      setErrors({ amount: ['Informe um valor válido'] });
      return;
    }
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      setErrors({ dayOfMonth: ['Dia entre 1 e 31'] });
      return;
    }

    startTransition(async () => {
      const result = await createRecurringRule({
        accountId,
        categoryId,
        kind,
        description,
        amount,
        dayOfMonth: day,
        startDate,
        endDate: endDate || null,
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

      <Field label="Descrição" error={errors.description}>
        <Input
          placeholder="Ex: Aluguel, Salário, Spotify"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Valor" error={errors.amount}>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Dia do mês" error={errors.dayOfMonth}>
          <Input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Início" error={errors.startDate}>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Fim (opcional)" error={errors.endDate}>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
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
  value: Kind;
  onChange: (k: Kind) => void;
}) {
  const options: Array<{ key: Kind; label: string }> = [
    { key: 'expense', label: 'Saída' },
    { key: 'income', label: 'Entrada' },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
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
