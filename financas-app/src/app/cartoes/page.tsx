import { format } from 'date-fns';
import { CreditCard, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  listCreditCards,
  getCardCycle,
  getOpenInvoiceTotal,
  listCardPurchases,
} from '@/lib/cards';
import { listCategories } from '@/lib/accounts';
import { formatBRL, formatDateShort } from '@/lib/format';
import { ensureRecurringGenerated } from '@/lib/boot';
import { NewCardPurchaseDialog } from '@/components/new-card-purchase-dialog';
import { DeleteCardPurchaseButton } from '@/components/delete-card-purchase-button';

export default function CartoesPage() {
  ensureRecurringGenerated();

  const cards = listCreditCards();
  const expenseCategories = listCategories('expense');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Cartões
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Faturas em aberto e compras parceladas em andamento.
          </p>
        </div>
        <NewCardPurchaseDialog
          cards={cards}
          categories={expenseCategories}
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-6">
          {cards.map((card) => (
            <CardSection key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardSection({ card }: { card: ReturnType<typeof listCreditCards>[number] }) {
  const cycle = getCardCycle(card);
  const invoiceTotal = getOpenInvoiceTotal(card.id);
  const purchases = listCardPurchases(card.id).filter((p) => p.remainingAmount > 0);

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <CreditCard className="size-5 text-muted-foreground" />
          <span className="font-display text-lg font-medium">{card.name}</span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
            {card.ownership}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 border-b border-border px-6 py-5 md:grid-cols-3">
        <Stat label="Fatura aberta" value={formatBRL(invoiceTotal)} accent />
        <Stat
          label="Próximo fechamento"
          value={cycle ? format(cycle.nextClosing, 'dd/MM/yy') : '—'}
        />
        <Stat
          label="Próximo vencimento"
          value={cycle ? format(cycle.nextDue, 'dd/MM/yy') : '—'}
        />
      </div>

      {!cycle && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 text-neutral" />
          Configure dia de fechamento e vencimento em{' '}
          <span className="font-medium text-foreground">/config</span> pra
          calcular ciclo.
        </div>
      )}

      <div className="px-6 py-5">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Compras parceladas em aberto
        </h3>
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma compra parcelada em aberto.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-32 text-right">Progresso</TableHead>
                <TableHead className="w-32 text-right">Restante</TableHead>
                <TableHead className="w-24">Início</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="font-medium">
                    {p.description}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatBRL(p.totalAmount)} total
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.categoryName ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.paidCount}/{p.totalCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-negative">
                    {formatBRL(p.remainingAmount)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDateShort(p.firstInstallmentDate)}
                  </TableCell>
                  <TableCell className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <DeleteCardPurchaseButton
                      id={p.id}
                      description={p.description}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={
          accent
            ? 'tabular-nums text-2xl font-semibold text-foreground'
            : 'tabular-nums text-base text-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface py-20 text-center">
      <p className="text-sm text-foreground">Nenhum cartão de crédito.</p>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        Cadastre cartões em /config (ou rode o seed) — eles aparecem aqui com
        fatura em aberto e compras parceladas.
      </p>
    </div>
  );
}
