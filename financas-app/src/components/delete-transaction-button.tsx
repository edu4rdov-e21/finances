'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
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
import { deleteTransaction } from '@/lib/actions/transactions';

interface Props {
  id: string;
  description: string;
}

export function DeleteTransactionButton({ id, description }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Excluir lançamento"
        >
          <Trash2 className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir lançamento?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Vai apagar:
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
            <Button variant="outline" disabled={isPending} type="button">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="negative"
            onClick={handleDelete}
            disabled={isPending}
            type="button"
          >
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
