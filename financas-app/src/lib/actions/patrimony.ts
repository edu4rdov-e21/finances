'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { format, startOfMonth } from 'date-fns';
import { db, schema } from '@/db/client';
import type { ActionResult } from './types';

// Schema interno (regra do 'use server': só funções async exportadas).
const saveSnapshotSchema = z.object({
  /** primeiro dia do mês de referência. default = mês corrente */
  monthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** valor em centavos das aplicações manuais (>= 0) */
  investments: z.number().int().nonnegative('Valor não pode ser negativo'),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type SaveSnapshotInput = z.infer<typeof saveSnapshotSchema>;

/**
 * Cria ou atualiza o snapshot do mês. Chave = primeiro dia do mês.
 * Se já existe snapshot pro mês, sobrescreve (upsert manual).
 */
export async function saveSnapshot(
  input: SaveSnapshotInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = saveSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Dados inválidos',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const monthDate =
    parsed.data.monthDate ??
    format(startOfMonth(new Date()), 'yyyy-MM-dd');

  // Upsert: tenta achar snapshot existente pra esse mês
  const existing = db
    .select()
    .from(schema.assetsSnapshots)
    .where(eq(schema.assetsSnapshots.date, monthDate))
    .get();

  let id: string;
  if (existing) {
    id = existing.id;
    db.update(schema.assetsSnapshots)
      .set({
        investments: parsed.data.investments,
        notes: parsed.data.notes ?? null,
      })
      .where(eq(schema.assetsSnapshots.id, id))
      .run();
  } else {
    id = ulid();
    db.insert(schema.assetsSnapshots)
      .values({
        id,
        date: monthDate,
        accountId: null,
        investments: parsed.data.investments,
        notes: parsed.data.notes ?? null,
      })
      .run();
  }

  try {
    revalidatePath('/patrimonio');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }

  return { ok: true, data: { id } };
}

/**
 * Apaga snapshot de um mês específico (caso o usuário queira refazer).
 */
export async function deleteSnapshot(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const result = db
    .delete(schema.assetsSnapshots)
    .where(eq(schema.assetsSnapshots.id, id))
    .run();

  if (result.changes === 0) {
    return { ok: false, error: 'Snapshot não encontrado' };
  }

  try {
    revalidatePath('/patrimonio');
    revalidatePath('/');
  } catch {
    /* fora de contexto */
  }

  return { ok: true, data: undefined };
}
