'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
import { Button } from '@/components/ui/button';
import {
  toggleRecurringRule,
  deleteRecurringRule,
} from '@/lib/actions/recurring';

interface Props {
  id: string;
  active: boolean;
  description: string;
}

export function RecurringRuleRowActions({ id, active, description }: Props) {
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [open, setOpen] = useState(false);
  const [deletedPending, setDeletedPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleToggle(checked: boolean) {
    startToggle(async () => {
      await toggleRecurringRule(id, checked);
    });
  }

  function handleDelete() {
    setError(null);
    startDelete(async () => {
      const result = await deleteRecurringRule(id);
      if (result.ok) {
        setDeletedPending(result.data.deletedPending);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-3">
      <Switch
        checked={active}
        onCheckedChange={handleToggle}
        disabled={isToggling}
        aria-label={active ? 'Desativar' : 'Ativar'}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Excluir regra"
          >
            <Trash2 className="size-4" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir recorrência?</DialogTitle>
            <DialogDescription>
              Lançamentos confirmados ficam intactos. Os pendentes futuros
              serão apagados.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium">
            {description}
          </p>
          {error && (
            <p className="text-sm text-negative" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting} type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="negative"
              onClick={handleDelete}
              disabled={isDeleting}
              type="button"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deletedPending !== null && deletedPending > 0 && (
        <span className="sr-only" role="status">
          {deletedPending} lançamentos pendentes foram apagados.
        </span>
      )}
    </div>
  );
}
