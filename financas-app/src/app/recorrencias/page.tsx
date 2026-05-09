import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { listRecurringRules } from '@/lib/recurring';
import { listAccounts, listCategories } from '@/lib/accounts';
import { formatBRL, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NewRecurringRuleDialog } from '@/components/new-recurring-rule-dialog';
import { RecurringRuleRowActions } from '@/components/recurring-rule-row-actions';
import { ensureRecurringGenerated } from '@/lib/boot';

export default function RecorrenciasPage() {
  ensureRecurringGenerated();
  const rules = listRecurringRules();
  const accounts = listAccounts();
  const categories = listCategories();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Recorrências
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Despesas e entradas mensais. Cada regra gera lançamentos pendentes
            pros próximos 12 meses.
          </p>
        </div>
        <NewRecurringRuleDialog accounts={accounts} categories={categories} />
      </div>

      {rules.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-16 text-right">Dia</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const isActive = rule.active === 1;
                const isIncome = rule.kind === 'income';
                return (
                  <TableRow
                    key={rule.id}
                    className={cn(!isActive && 'opacity-50')}
                  >
                    <TableCell />
                    <TableCell className="font-medium">
                      {rule.description}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.accountName ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.categoryName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {rule.dayOfMonth}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        isIncome ? 'text-positive' : 'text-negative'
                      )}
                    >
                      {isIncome ? '+' : '−'}
                      {formatBRL(rule.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums text-xs">
                      {formatDateShort(rule.startDate)}
                      {rule.endDate ? ` → ${formatDateShort(rule.endDate)}` : ''}
                    </TableCell>
                    <TableCell>
                      <RecurringRuleRowActions
                        id={rule.id}
                        active={isActive}
                        description={rule.description}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface py-20 text-center">
      <p className="text-sm text-foreground">Nenhuma recorrência cadastrada.</p>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        Use o botão &quot;Nova recorrência&quot; pra cadastrar aluguel,
        salário, assinaturas — qualquer despesa ou entrada mensal previsível.
      </p>
    </div>
  );
}
