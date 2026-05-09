import { z } from 'zod';
import { and, desc, eq, like } from 'drizzle-orm';
import {
  addMonths,
  format,
  isAfter,
  isBefore,
  lastDayOfMonth,
  parseISO,
  setDate,
  startOfMonth,
} from 'date-fns';
import { ulid } from 'ulid';
import { db, schema } from '@/db/client';

const RULE_KIND = z.enum(['expense', 'income']);
const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em formato YYYY-MM-DD');

export const createRecurringRuleSchema = z.object({
  accountId: z.string().min(1, 'Conta obrigatória'),
  categoryId: z.string().min(1, 'Categoria obrigatória'),
  kind: RULE_KIND,
  description: z.string().trim().min(1, 'Descrição obrigatória').max(200),
  amount: z.number().int().positive('Valor deve ser positivo'),
  dayOfMonth: z
    .number()
    .int()
    .min(1, 'Dia entre 1 e 31')
    .max(31, 'Dia entre 1 e 31'),
  startDate: ISO_DATE,
  endDate: ISO_DATE.nullable().optional(),
});

export const updateRecurringRuleSchema = createRecurringRuleSchema
  .partial()
  .extend({ id: z.string().min(1) });

export type CreateRecurringRuleInput = z.infer<
  typeof createRecurringRuleSchema
>;
export type UpdateRecurringRuleInput = z.infer<
  typeof updateRecurringRuleSchema
>;
export type RecurringRule = typeof schema.recurringRules.$inferSelect;

export type RecurringRuleRow = RecurringRule & {
  accountName: string | null;
  categoryName: string | null;
};

export function listRecurringRules(): RecurringRuleRow[] {
  return db
    .select({
      id: schema.recurringRules.id,
      accountId: schema.recurringRules.accountId,
      categoryId: schema.recurringRules.categoryId,
      kind: schema.recurringRules.kind,
      description: schema.recurringRules.description,
      amount: schema.recurringRules.amount,
      dayOfMonth: schema.recurringRules.dayOfMonth,
      startDate: schema.recurringRules.startDate,
      endDate: schema.recurringRules.endDate,
      active: schema.recurringRules.active,
      accountName: schema.accounts.name,
      categoryName: schema.categories.name,
    })
    .from(schema.recurringRules)
    .leftJoin(
      schema.accounts,
      eq(schema.recurringRules.accountId, schema.accounts.id)
    )
    .leftJoin(
      schema.categories,
      eq(schema.recurringRules.categoryId, schema.categories.id)
    )
    .orderBy(
      desc(schema.recurringRules.active),
      schema.recurringRules.dayOfMonth,
      schema.recurringRules.description
    )
    .all();
}

/**
 * Cálculo puro: dado uma regra, devolve as próximas N datas (ISO).
 *
 * Edge cases tratados:
 * - dayOfMonth=31 em fev → vira 28 ou 29 (último dia do mês)
 * - dayOfMonth=31 em mês de 30 dias → vira 30
 * - startDate no futuro → ocorrências começam no mês de startDate
 * - startDate no passado → ocorrências começam no mês corrente
 * - endDate definido → para quando ultrapassa
 * - dayOfMonth antes de startDate dentro do mês de start → pula esse mês
 *
 * Função PURA: não toca no banco. Testável sem mock. Útil também pro form
 * mostrar prévia ao usuário ("próxima ocorrência: 5 de junho").
 */
export function nextOccurrences(
  rule: Pick<RecurringRule, 'dayOfMonth' | 'startDate' | 'endDate'>,
  monthsAhead: number,
  now: Date = new Date()
): string[] {
  const dates: string[] = [];
  const startBoundary = parseISO(rule.startDate);
  const endBoundary = rule.endDate ? parseISO(rule.endDate) : null;

  const cursorMonth = isAfter(startBoundary, now)
    ? startOfMonth(startBoundary)
    : startOfMonth(now);

  // Itera até acumular `monthsAhead` ocorrências. Margem de segurança evita
  // loop infinito caso startDate caia depois do dayOfMonth no primeiro mês
  // (uma ocorrência é "perdida" e precisamos olhar um mês a mais).
  const maxIterations = monthsAhead + 12;
  for (let i = 0; i < maxIterations && dates.length < monthsAhead; i++) {
    const m = addMonths(cursorMonth, i);
    const lastDay = lastDayOfMonth(m).getDate();
    const day = Math.min(rule.dayOfMonth, lastDay);
    const occurrence = setDate(m, day);

    if (isBefore(occurrence, startBoundary)) continue;
    if (endBoundary && isAfter(occurrence, endBoundary)) break;

    dates.push(format(occurrence, 'yyyy-MM-dd'));
  }

  return dates;
}

/**
 * Job idempotente.
 *
 * Pra cada regra ativa: gera 12 próximas ocorrências, e pra cada uma verifica
 * se já existe transaction com mesmo recurring_rule_id no mesmo mês — se não,
 * cria com status='pending'.
 *
 * Filtragem por MÊS (não por data exata) é deliberada: se o usuário editar
 * a transaction movendo a data dentro do mês, a re-execução do job não duplica.
 *
 * Devolve quantas transactions foram criadas (zero em rodadas idempotentes).
 */
export function generateRecurringTransactions(
  monthsAhead = 12
): { generated: number } {
  const activeRules = db
    .select()
    .from(schema.recurringRules)
    .where(eq(schema.recurringRules.active, 1))
    .all();

  let generated = 0;

  for (const rule of activeRules) {
    const dates = nextOccurrences(rule, monthsAhead);

    for (const date of dates) {
      const yearMonth = date.slice(0, 7); // "2026-05"
      const existing = db
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.recurringRuleId, rule.id),
            like(schema.transactions.date, `${yearMonth}%`)
          )
        )
        .get();

      if (existing) continue;

      db.insert(schema.transactions)
        .values({
          id: ulid(),
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          date,
          amount: rule.amount,
          kind: rule.kind,
          description: rule.description,
          recurringRuleId: rule.id,
          status: 'pending',
        })
        .run();
      generated++;
    }
  }

  return { generated };
}
