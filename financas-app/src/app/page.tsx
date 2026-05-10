import { AlertCircle, AlertTriangle } from 'lucide-react';
import { eq, and } from 'drizzle-orm';
import {
  Card,
  CardHeader,
  CardTitle,
  CardValue,
  CardFooter,
} from '@/components/ui/card';
import { formatBRL, formatDateShort, formatTxAmount } from '@/lib/format';
import { ensureRecurringGenerated } from '@/lib/boot';
import { getProjectedBalance } from '@/lib/projection';
import { getMinimumReserve } from '@/lib/reserve';
import { listUpcomingTransactions } from '@/lib/transactions';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import { db, schema } from '@/db/client';
import { cn } from '@/lib/utils';
import { ProjectionChart } from '@/components/projection-chart';

export default async function DashboardPage() {
  const workspaceId = await requireActiveWorkspaceId();
  await ensureRecurringGenerated(workspaceId);

  const projection = await getProjectedBalance(workspaceId, { monthsAhead: 12 });
  const reserve = await getMinimumReserve(workspaceId);
  const upcoming = await listUpcomingTransactions(workspaceId, 10);

  const cardPendingRows = await db
    .select({ amount: schema.transactions.amount })
    .from(schema.transactions)
    .innerJoin(
      schema.accounts,
      eq(schema.transactions.accountId, schema.accounts.id)
    )
    .where(
      and(
        eq(schema.transactions.workspaceId, workspaceId),
        eq(schema.accounts.kind, 'credit_card'),
        eq(schema.transactions.kind, 'expense'),
        eq(schema.transactions.status, 'pending')
      )
    );
  const faturaAberta = cardPendingRows.reduce((s, r) => s + r.amount, 0);

  const negativeMonths = projection.months.filter((m) => m.balance < 0);
  const belowReserveMonths = projection.months.filter(
    (m) => m.balance >= 0 && m.balance < reserve
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão consolidada do seu estado financeiro.
        </p>
      </div>

      {(negativeMonths.length > 0 || belowReserveMonths.length > 0) && (
        <Alerts
          negative={negativeMonths.map((m) => m.monthLabel)}
          belowReserve={belowReserveMonths.map((m) => m.monthLabel)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Saldo atual</CardTitle>
          </CardHeader>
          <CardValue
            className={cn(
              projection.currentBalance < 0 && 'text-negative'
            )}
          >
            {formatBRL(projection.currentBalance)}
          </CardValue>
          <CardFooter>Soma das contas correntes</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lucro do mês</CardTitle>
          </CardHeader>
          <CardValue
            className={cn(
              projection.currentMonthDelta > 0 && 'text-positive',
              projection.currentMonthDelta < 0 && 'text-negative'
            )}
          >
            {projection.currentMonthDelta >= 0 ? '+' : ''}
            {formatBRL(projection.currentMonthDelta)}
          </CardValue>
          <CardFooter>Entradas menos saídas (mês corrente)</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reserva mínima</CardTitle>
          </CardHeader>
          <CardValue className="text-neutral">{formatBRL(reserve)}</CardValue>
          <CardFooter>30% × média de gastos (3 meses)</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fatura aberta</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(faturaAberta)}</CardValue>
          <CardFooter>Parcelas pendentes em cartões</CardFooter>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProjectionChart
            months={projection.months}
            currentBalance={projection.currentBalance}
            reserve={reserve}
            description="Linha caramelo = reserva mínima. Pontos vermelhos = saldo negativo, caramelo = abaixo da reserva, verde = OK."
          />
        </div>
        <UpcomingList rows={upcoming} />
      </div>
    </div>
  );
}

function Alerts({
  negative,
  belowReserve,
}: {
  negative: string[];
  belowReserve: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {negative.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" />
          <div>
            <span className="font-medium text-foreground">
              Saldo negativo previsto:
            </span>{' '}
            <span className="text-muted-foreground">
              {negative.join(', ')}
            </span>
          </div>
        </div>
      )}
      {belowReserve.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-neutral/30 bg-neutral/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-neutral" />
          <div>
            <span className="font-medium text-foreground">
              Saldo abaixo da reserva mínima:
            </span>{' '}
            <span className="text-muted-foreground">
              {belowReserve.join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function UpcomingList({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listUpcomingTransactions>>;
}) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h3 className="font-display text-base font-medium tracking-tight">
          Próximos lançamentos
        </h3>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-xs text-muted-foreground">
          Nenhum lançamento futuro.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const { display, tone } = formatTxAmount(row.amount, row.kind);
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {row.description}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatDateShort(row.date)}
                    </span>
                    <span>·</span>
                    <span className="truncate">{row.accountName ?? '—'}</span>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 tabular-nums text-sm font-medium',
                    tone === 'positive' && 'text-positive',
                    tone === 'negative' && 'text-negative',
                    tone === 'neutral' && 'text-neutral'
                  )}
                >
                  {display}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
