import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Label HTML nativo (sem Radix). O Radix.Label adicionaria suporte a alguns
 * casos exóticos de teclado, mas pra forms simples o <label> nativo já
 * resolve com `htmlFor`.
 */
export function Label({
  className,
  ...props
}: React.ComponentProps<'label'>) {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none text-foreground',
        className
      )}
      {...props}
    />
  );
}
