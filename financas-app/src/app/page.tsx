import { Card, CardHeader, CardTitle, CardValue, CardFooter } from '@/components/ui/card';
import { formatBRL } from '@/lib/format';
import { ensureRecurringGenerated } from '@/lib/boot';

export default function DashboardPage() {
  ensureRecurringGenerated();

  // Etapa 5 vai trocar esses zeros por valores reais (lib/projection, lib/reserve).
  const placeholders = {
    saldoAtual: 0,
    lucroMes: 0,
    reservaMinima: 0,
    faturaAberta: 0,
  };

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Saldo atual</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(placeholders.saldoAtual)}</CardValue>
          <CardFooter>Soma das contas correntes</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lucro do mês</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(placeholders.lucroMes)}</CardValue>
          <CardFooter>Entradas menos saídas</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reserva mínima</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(placeholders.reservaMinima)}</CardValue>
          <CardFooter>30% × média de gastos (3 meses)</CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fatura aberta</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(placeholders.faturaAberta)}</CardValue>
          <CardFooter>Parcelas futuras de todos os cartões</CardFooter>
        </Card>
      </div>

      <div className="flex h-96 items-center justify-center rounded-md border border-dashed border-border bg-surface text-sm text-muted-foreground">
        Gráfico de saldo projetado virá na Etapa 5
      </div>
    </div>
  );
}
