'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Sparkles, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
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
import { ProjectionChart } from '@/components/projection-chart';
import { cn } from '@/lib/utils';
import { parseBRL } from '@/lib/parse';
import { formatBRL } from '@/lib/format';
import {
  computeProjection,
  type ProjectionAccount,
  type ProjectionTx,
} from '@/lib/projection-compute';
import {
  buildHypotheticalExpense,
  buildHypotheticalInstallments,
  computeVerdict,
} from '@/lib/simulator';
import { createTransaction } from '@/lib/actions/transactions';
import { createCardPurchase } from '@/lib/actions/card-purchases';
import type { AccountRow, CategoryRow } from '@/lib/accounts';

type Mode = 'account' | 'card';
type FieldErrors = Record<string, string[] | undefined>;

interface Props {
  accounts: AccountRow[]; // todas
  categories: CategoryRow[]; // só expense
  reserve: number;
  projectionAccounts: ProjectionAccount[];
  allTransactions: ProjectionTx[];
}

export function Simulator({
  accounts,
  categories,
  reserve,
  projectionAccounts,
  allTransactions,
}: Props) {
  const router = useRouter();
  const checkings = accounts.filter((a) => a.kind === 'checking');
  const cards = accounts.filter((a) => a.kind === 'credit_card');

  const [mode, setMode] = useState<Mode>('account');
  const [accountId, setAccountId] = useState(checkings[0]?.id ?? '');
  const [cardId, setCardId] = useState(cards[0]?.id ?? '');
  const [paymentSourceId, setPaymentSourceId] = useState(
    checkings[0]?.id ?? ''
  );
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [installmentsInput, setInstallmentsInput] = useState('1');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Projeção SEM a hipótese (baseline). Recalculada só se baseline mudar.
  const projectionA = useMemo(
    () =>
      computeProjection({
        accounts: projectionAccounts,
        transactions: allTransactions,
        monthsAhead: 12,
      }),
    [projectionAccounts, allTransactions]
  );

  // Hipótese construída a partir dos inputs.
  const hypothetical = useMemo(() => {
    const total = parseBRL(amountInput);
    if (total == null || total <= 0) return [];

    if (mode === 'account') {
      if (!accountId) return [];
      return buildHypotheticalExpense({
        accountId,
        date,
        amountCents: total,
      });
    }

    // mode === 'card' — pessimismo: parcelas saem da paymentSource (checking)
    if (!paymentSourceId) return [];
    const n = Number(installmentsInput);
    if (!Number.isInteger(n) || n < 1 || n > 60) return [];
    return buildHypotheticalInstallments({
      accountId: paymentSourceId,
      firstInstallmentDate: date,
      totalAmountCents: total,
      installments: n,
    });
  }, [mode, accountId, paymentSourceId, amountInput, installmentsInput, date]);

  // Projeção COM a hipótese. Recalcula em cada mudança de input.
  const projectionB = useMemo(
    () =>
      computeProjection({
        accounts: projectionAccounts,
        transactions: allTransactions,
        monthsAhead: 12,
        hypothetical,
      }),
    [projectionAccounts, allTransactions, hypothetical]
  );

  const verdict = useMemo(
    () => computeVerdict({ months: projectionB.months, reserve }),
    [projectionB.months, reserve]
  );

  const totalCents = parseBRL(amountInput);
  const installmentsNum = Number(installmentsInput);
  const previewParcela =
    mode === 'card' &&
    totalCents != null &&
    totalCents > 0 &&
    installmentsNum > 0
      ? Math.floor(totalCents / installmentsNum)
      : null;

  function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    if (totalCents == null || totalCents <= 0) {
      setErrors({ amount: ['Informe um valor válido'] });
      return;
    }
    if (!description.trim()) {
      setErrors({ description: ['Descrição obrigatória'] });
      return;
    }
    if (!categoryId) {
      setErrors({ categoryId: ['Categoria obrigatória'] });
      return;
    }

    startTransition(async () => {
      if (mode === 'account') {
        if (!accountId) {
          setErrors({ accountId: ['Conta obrigatória'] });
          return;
        }
        const result = await createTransaction({
          accountId,
          categoryId,
          date,
          amountCents: totalCents,
          kind: 'expense',
          description: description.trim(),
          notes: null,
        });
        if (result.ok) {
          router.push('/lancamentos');
        } else {
          setErrors(result.fieldErrors ?? {});
          if (!result.fieldErrors) setFormError(result.error);
        }
      } else {
        // card
        if (!cardId) {
          setErrors({ cardId: ['Cartão obrigatório'] });
          return;
        }
        if (
          !Number.isInteger(installmentsNum) ||
          installmentsNum < 1 ||
          installmentsNum > 60
        ) {
          setErrors({ installments: ['Entre 1 e 60 parcelas'] });
          return;
        }
        const result = await createCardPurchase({
          accountId: cardId,
          categoryId,
          description: description.trim(),
          totalAmountCents: totalCents,
          installments: installmentsNum,
          firstInstallmentDate: date,
        });
        if (result.ok) {
          router.push('/lancamentos');
        } else {
          setErrors(result.fieldErrors ?? {});
          if (!result.fieldErrors) setFormError(result.error);
        }
      }
    });
  }

  function handleDiscard() {
    setDescription('');
    setAmountInput('');
    setInstallmentsInput('1');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setCategoryId('');
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Simulador
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Veja o impacto de uma compra nos próximos 12 meses antes de gastar.
        </p>
      </div>

      <form
        onSubmit={handleConfirm}
        className="rounded-md border border-border bg-surface p-6 flex flex-col gap-4"
      >
        <ModeSelector value={mode} onChange={setMode} />

        <Field label="Descrição" error={errors.description}>
          <Input
            placeholder={
              mode === 'card'
                ? 'Ex: Notebook Apple'
                : 'Ex: Curso de fotografia'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mode === 'account' ? (
            <Field label="Conta de saída" error={errors.accountId}>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {checkings.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Cartão" error={errors.cardId}>
              <Select value={cardId} onValueChange={setCardId}>
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
          )}

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

        {mode === 'card' && (
          <Field
            label="Conta usada na simulação (origem dos pagamentos)"
            hint="Pessimismo: as parcelas são consideradas como saída desta conta nas datas do vencimento. Saldo real do cartão é calculado em /cartoes."
            error={errors.paymentSourceId}
          >
            <Select
              value={paymentSourceId}
              onValueChange={setPaymentSourceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {checkings.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field
            label={mode === 'card' ? 'Valor total' : 'Valor'}
            error={errors.amount}
          >
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="tabular-nums"
            />
          </Field>
          {mode === 'card' && (
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
          )}
          <Field
            label={mode === 'card' ? '1ª parcela' : 'Data'}
            error={errors.date}
          >
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        {previewParcela != null && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground tabular-nums">
            {installmentsNum}× de aprox. {formatBRL(previewParcela)} (a última
            absorve o resto pra fechar exato)
          </p>
        )}

        {formError && (
          <p className="text-sm text-negative" role="alert">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
            disabled={isPending}
          >
            Limpar
          </Button>
          <Button type="submit" variant="positive" disabled={isPending}>
            {isPending ? 'Confirmando…' : 'Confirmar compra'}
          </Button>
        </div>
      </form>

      {hypothetical.length > 0 && (
        <>
          <VerdictBanner verdict={verdict} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ProjectionChart
              months={projectionA.months}
              currentBalance={projectionA.currentBalance}
              reserve={reserve}
              title="Sem a compra"
              description="Como vai ficar o saldo se você não fizer essa compra."
            />
            <ProjectionChart
              months={projectionB.months}
              currentBalance={projectionB.currentBalance}
              reserve={reserve}
              title="Com a compra"
              description="Saldo projetado considerando a hipótese acima."
            />
          </div>
        </>
      )}

      {hypothetical.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface py-16 text-center">
          <Sparkles className="mb-3 size-6 text-muted-foreground" />
          <p className="text-sm text-foreground">
            Preencha o formulário pra simular o impacto.
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Os gráficos vão aparecer lado a lado: sem a compra à esquerda, com
            a compra à direita.
          </p>
        </div>
      )}
    </div>
  );
}

function ModeSelector({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  const options: Array<{ key: Mode; label: string }> = [
    { key: 'account', label: 'Saída em conta' },
    { key: 'card', label: 'Compra parcelada (cartão)' },
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

function VerdictBanner({
  verdict,
}: {
  verdict: ReturnType<typeof computeVerdict>;
}) {
  const styles = {
    green: {
      icon: CheckCircle2,
      bg: 'bg-positive/10',
      border: 'border-positive/30',
      iconColor: 'text-positive',
    },
    yellow: {
      icon: AlertTriangle,
      bg: 'bg-neutral/10',
      border: 'border-neutral/30',
      iconColor: 'text-neutral',
    },
    red: {
      icon: AlertCircle,
      bg: 'bg-negative/10',
      border: 'border-negative/30',
      iconColor: 'text-negative',
    },
  }[verdict.level];
  const Icon = styles.icon;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border px-5 py-4',
        styles.bg,
        styles.border
      )}
    >
      <Icon className={cn('size-5 shrink-0', styles.iconColor)} />
      <p className="text-sm font-medium">{verdict.message}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && error.length > 0 && (
        <p className="text-xs text-negative" role="alert">
          {error[0]}
        </p>
      )}
    </div>
  );
}
