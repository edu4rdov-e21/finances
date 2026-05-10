'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseBRL } from '@/lib/parse';
import { formatBRL } from '@/lib/format';
import { saveSnapshot } from '@/lib/actions/patrimony';

interface Props {
  currentInvestments: number; // centavos
  currentNotes: string | null;
  hasSnapshot: boolean;
}

export function PatrimonyForm({
  currentInvestments,
  currentNotes,
  hasSnapshot,
}: Props) {
  const router = useRouter();
  // Pre-preenche com snapshot existente se houver, mostrando formato BR
  const [investmentsInput, setInvestmentsInput] = useState(
    currentInvestments > 0
      ? (currentInvestments / 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : ''
  );
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const investments = parseBRL(investmentsInput);
    if (investments == null || investments < 0) {
      setError('Informe um valor válido (use 0 se não tem investimentos)');
      return;
    }

    startTransition(async () => {
      const result = await saveSnapshot({
        investments,
        notes: notes.trim() || null,
      });
      if (result.ok) {
        setSuccess(
          hasSnapshot ? 'Snapshot atualizado.' : 'Snapshot salvo.'
        );
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-border bg-surface p-6 flex flex-col gap-4"
    >
      <div>
        <h3 className="font-display text-lg font-medium tracking-tight">
          Snapshot do mês corrente
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe o valor das suas aplicações financeiras (B3, CDB, cripto,
          etc.) que o app não rastreia automaticamente.
          {hasSnapshot && (
            <>
              {' '}
              <span className="text-foreground">
                Snapshot já existe — atualizar sobrescreve.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1 flex flex-col gap-1.5">
          <Label htmlFor="investments">Investimentos (R$)</Label>
          <Input
            id="investments"
            inputMode="decimal"
            placeholder="0,00"
            value={investmentsInput}
            onChange={(e) => setInvestmentsInput(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input
            id="notes"
            placeholder="Ex: Tesouro Selic + ações Itaú"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-positive" role="status">
          {success}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {parseBRL(investmentsInput) != null &&
            `Será salvo como ${formatBRL(parseBRL(investmentsInput) ?? 0)}`}
        </span>
        <Button type="submit" disabled={isPending}>
          <Save />
          {isPending
            ? 'Salvando…'
            : hasSnapshot
            ? 'Atualizar snapshot'
            : 'Salvar snapshot'}
        </Button>
      </div>
    </form>
  );
}
