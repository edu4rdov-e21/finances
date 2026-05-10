'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL } from '@/lib/format';
import type { PatrimonyMonth } from '@/lib/patrimony';

interface Props {
  data: PatrimonyMonth[];
}

export function PatrimonyChart({ data }: Props) {
  const chartData = data.map((d) => ({
    label: d.monthLabel,
    total: d.total,
    checking: d.checking,
    investments: d.investments,
    cards: d.cards,
  }));

  return (
    <div className="rounded-md border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="font-display text-lg font-medium tracking-tight">
          Evolução do patrimônio — 12 meses
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Saldos confirmed das contas + investimentos do snapshot mensal.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 32, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-positive)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-positive)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            opacity={0.4}
          />
          <XAxis
            dataKey="label"
            stroke="var(--color-muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--color-muted-foreground)"
            tick={{ fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v: number) =>
              `${(v / 100).toLocaleString('pt-BR', {
                maximumFractionDigits: 0,
              })}`
            }
            width={70}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--color-positive)"
            strokeWidth={2}
            fill="url(#totalGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipDatum {
  total: number;
  checking: number;
  investments: number;
  cards: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: TooltipDatum }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3 shadow-md text-xs tabular-nums">
      <div className="mb-2 font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Contas:</span>
        <span className="text-right">{formatBRL(d.checking)}</span>
        <span className="text-muted-foreground">Cartões:</span>
        <span className="text-right text-negative">{formatBRL(d.cards)}</span>
        <span className="text-muted-foreground">Investimentos:</span>
        <span className="text-right">{formatBRL(d.investments)}</span>
        <span className="border-t border-border pt-1 font-medium">Total:</span>
        <span className="border-t border-border pt-1 text-right font-medium">
          {formatBRL(d.total)}
        </span>
      </div>
    </div>
  );
}
