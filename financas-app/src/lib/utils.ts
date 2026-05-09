import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina classes Tailwind resolvendo conflitos.
 *
 *   cn('px-4 py-2', condicao && 'bg-positive', extra)
 *
 * Aceita strings, arrays, objetos condicionais e classes nulas/false (são ignoradas).
 * Quando há conflito (ex: 'px-4' e 'px-8'), a última vence.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
