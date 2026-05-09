'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  RotateCcw,
  CreditCard,
  Wallet,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Lançamentos', href: '/lancamentos', icon: ArrowLeftRight },
  { label: 'Recorrências', href: '/recorrencias', icon: RotateCcw },
  { label: 'Cartões', href: '/cartoes', icon: CreditCard },
  { label: 'Patrimônio', href: '/patrimonio', icon: Wallet },
  { label: 'Simulador', href: '/simulador', icon: Sparkles },
  { label: 'Config', href: '/config', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <span className="font-display text-xl font-medium tracking-tight text-foreground">
          Finanças
        </span>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
