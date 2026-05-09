import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const OWNERSHIPS = ['PF', 'PJ', 'Consolidado'] as const;
type Ownership = (typeof OWNERSHIPS)[number];

/**
 * Por enquanto o seletor é estático: mostra "Consolidado" ativo. Quando o
 * dashboard precisar de fato filtrar por ownership (Etapa 5), promovemos
 * pra Client Component e plugamos num estado global.
 */
export function Header({ ownership = 'Consolidado' as Ownership }) {
  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: ptBR });
  const capitalized = monthLabel[0].toUpperCase() + monthLabel.slice(1);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-8">
      <span className="font-display text-base text-muted-foreground">
        {capitalized}
      </span>
      <div className="flex items-center gap-1 rounded-md border border-border p-1">
        {OWNERSHIPS.map((opt) => (
          <span
            key={opt}
            className={cn(
              'cursor-default rounded px-3 py-1 text-xs font-medium',
              opt === ownership
                ? 'bg-foreground text-background'
                : 'text-muted-foreground'
            )}
          >
            {opt}
          </span>
        ))}
      </div>
    </header>
  );
}
