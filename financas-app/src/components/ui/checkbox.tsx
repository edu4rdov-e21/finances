'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Checkbox sem Radix. role="checkbox" + aria-checked é o padrão HTML
 * acessível pra essa interação. Tab + Espaço/Enter funcionam nativamente.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'border-foreground bg-foreground text-background'
          : 'bg-transparent hover:border-foreground/60',
        className
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
