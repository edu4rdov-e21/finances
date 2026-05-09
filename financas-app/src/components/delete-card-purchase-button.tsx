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
import { deleteCardPurchase } from '@/lib/actions/card-purchases';

interface Props {
  id: string;
  description: string;
}

export function DeleteCardPurchaseButton({ id, description }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCardPurchase(id);
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
          aria-label="Excluir compra parcelada"
        >
          <Trash2 className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir compra parcelada?</DialogTitle>
          <DialogDescription>
            Apaga a compra e todas as parcelas pendentes. Se houver parcelas
            já confirmadas, a operação será bloqueada.
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
