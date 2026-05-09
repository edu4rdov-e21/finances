'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
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
import { parseBRL } from '@/lib/parse';
import { formatBRL } from '@/lib/format';
import { distributeInstallments } from '@/lib/installments';
import { createCardPurchase } from '@/lib/actions/card-purchases';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

type FieldErrors = Record<string, string[] | undefined>;

interface Props {
  cards: AccountRow[]; // só credit_card
  categories: CategoryRow[]; // só expense
}

export function NewCardPurchaseDialog({ cards, categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={cards.length === 0}>
          <Plus />
          Nova compra parcelada
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova compra parcelada</DialogTitle>
          <DialogDescription>
            Cria a compra e gera N lançamentos pendentes, um por mês.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Form
            cards={cards}
            categories={categories}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  cards,
  categories,
  onSuccess,
}: Props & { onSuccess: () => void }) {
  const [accountId, setAccountId] = useState(cards[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [installmentsInput, setInstallmentsInput] = useState('1');
  const [firstDate, setFirstDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Preview ao vivo das parcelas — mostra "12× de R$ 1.250,00 (última R$ 1.250,12)"
  const preview = useMemo(() => {
    const total = parseBRL(amountInput);
    const n = Number(installmentsInput);
    if (total == null || total <= 0) return null;
    if (!Number.isInteger(n) || n < 1 || n > 60) return null;
    const arr = distributeInstallments(total, n);
    const base = arr[0];
    const last = arr[arr.length - 1];
    return { n, base, last, hasRemainder: base !== last };
  }, [amountInput, installmentsInput]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const totalAmountCents = parseBRL(amountInput);
    if (totalAmountCents == null || totalAmountCents <= 0) {
      setErrors({ totalAmountCents: ['Informe um valor válido'] });
      return;
    }
    const installments = Number(installmentsInput);
    if (!Number.isInteger(installments) || installments < 1) {
      setErrors({ installments: ['Mínimo 1 parcela'] });
      return;
    }

    startTransition(async () => {
      const result = await createCardPurchase({
        accountId,
        categoryId,
        description,
        totalAmountCents,
        installments,
        firstInstallmentDate: firstDate,
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cartão" error={errors.accountId}>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
              {categories.map((c) => (
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
          placeholder="Ex: Notebook Apple"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Valor total" error={errors.totalAmountCents}>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Parcelas" error={errors.installments}>
          <Input
            type="number"
            min={1}
            max={60}
            value={installmentsInput}
            onChange={(e) => setInstallmentsInput(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="1ª parcela" error={errors.firstInstallmentDate}>
          <Input
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </Field>
      </div>

      {preview && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground tabular-nums">
          {preview.n}× de {formatBRL(preview.base)}
          {preview.hasRemainder && (
            <> (última {formatBRL(preview.last)} pra fechar exato)</>
          )}
        </p>
      )}

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
