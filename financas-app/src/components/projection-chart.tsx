'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL } from '@/lib/format';
import type { ProjectionMonth } from '@/lib/projection';

interface Props {
  months: ProjectionMonth[];
  currentBalance: number;
  reserve: number;
  title?: string;
  description?: string;
}

type Datum = { label: string; balance: number };

export function ProjectionChart({
  months,
  currentBalance,
  reserve,
  title = 'Saldo projetado — 12 meses',
  description,
}: Props) {
  // Insere o ponto "hoje" no início — usuário vê de onde a curva parte.
  const data: Datum[] = [
    { label: 'hoje', balance: currentBalance },
    ...months.map((m) => ({ label: m.monthLabel, balance: m.balance })),
  ];

  return (
    <div className="rounded-md border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="font-display text-lg font-medium tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
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
          {reserve > 0 && (
            <ReferenceLine
              y={reserve}
              stroke="var(--color-neutral)"
              strokeDasharray="4 4"
              label={{
                value: `Reserva ${formatBRL(reserve)}`,
                position: 'insideTopRight',
                fill: 'var(--color-neutral)',
                fontSize: 10,
              }}
            />
          )}
          <ReferenceLine
            y={0}
            stroke="var(--color-negative)"
            strokeDasharray="2 2"
            opacity={0.6}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="var(--color-foreground)"
            strokeWidth={2}
            dot={(props: DotProps) => (
              <ColoredDot key={`dot-${props.index}`} {...props} reserve={reserve} />
            )}
            activeDot={{ r: 6, stroke: 'var(--color-foreground)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type DotProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: Datum;
};

function ColoredDot({ cx, cy, payload, reserve }: DotProps & { reserve: number }) {
  if (cx == null || cy == null || !payload) return null;
  const balance = payload.balance;
  const fill =
    balance < 0
      ? 'var(--color-negative)'
      : balance < reserve
      ? 'var(--color-neutral)'
      : 'var(--color-positive)';
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="var(--color-background)" strokeWidth={1.5} />;
}

interface TooltipPayloadItem {
  value?: number | string;
  payload?: Datum;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-md">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 tabular-nums text-sm font-medium text-foreground">
        {formatBRL(value)}
      </div>
    </div>
  );
}
