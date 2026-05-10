import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Wallet, CreditCard, TrendingUp } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardValue,
  CardFooter,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ensureRecurringGenerated } from '@/lib/boot';
import {
  getCurrentMonthSnapshot,
  listSnapshots,
  computeMonthlyPatrimony,
  getCurrentPatrimony,
} from '@/lib/patrimony';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PatrimonyForm } from '@/components/patrimony-form';
import { PatrimonyChart } from '@/components/patrimony-chart';

export default async function PatrimonioPage() {
  const workspaceId = await requireActiveWorkspaceId();
  await ensureRecurringGenerated(workspaceId);

  const currentSnapshot = await getCurrentMonthSnapshot(workspaceId);
  const currentInvestments = currentSnapshot?.investments ?? 0;

  const [current, monthly, history] = await Promise.all([
    getCurrentPatrimony(workspaceId, { investments: currentInvestments }),
    computeMonthlyPatrimony(workspaceId, 12),
    listSnapshots(workspaceId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Patrimônio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão consolidada do que você tem (e do que deve).
        </p>
      </div>

      {/* Cards do mês corrente */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <Wallet className="mr-1 inline size-3" /> Contas correntes
            </CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(current.checking)}</CardValue>
          <CardFooter>Saldo total das checking</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <CreditCard className="mr-1 inline size-3" /> Cartões
            </CardTitle>
          </CardHeader>
          <CardValue
            className={cn(current.cards < 0 && 'text-negative')}
          >
            {formatBRL(current.cards)}
          </CardValue>
          <CardFooter>Negativo = a pagar</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <TrendingUp className="mr-1 inline size-3" /> Investimentos
            </CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(current.investments)}</CardValue>
          <CardFooter>
            {currentSnapshot
              ? 'Snapshot deste mês'
              : 'Sem snapshot ainda — registre abaixo'}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patrimônio líquido</CardTitle>
          </CardHeader>
          <CardValue
            className={cn(
              current.total > 0 && 'text-positive',
              current.total < 0 && 'text-negative'
            )}
          >
            {formatBRL(current.total)}
          </CardValue>
          <CardFooter>Contas + invest − cartões</CardFooter>
        </Card>
      </div>

      <PatrimonyForm
        currentInvestments={currentInvestments}
        currentNotes={currentSnapshot?.notes ?? null}
        hasSnapshot={currentSnapshot !== null}
      />

      <PatrimonyChart data={monthly} />

      {history.length > 0 && (
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h3 className="font-display text-base font-medium tracking-tight">
              Histórico de snapshots
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Mês</TableHead>
                <TableHead className="text-right">Investimentos</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums text-muted-foreground capitalize">
                    {format(parseISO(s.date), 'MMM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatBRL(s.investments)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
