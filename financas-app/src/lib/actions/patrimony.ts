'use server';

import { revalidatePath } from 'next/cache';
import { ulid } from 'ulid';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { format, startOfMonth } from 'date-fns';
import { db, schema } from '@/db/client';
import { requireActiveWorkspaceId } from '@/lib/workspace';
import type { ActionResult } from './types';

const saveSnapshotSchema = z.object({
  monthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  investments: z.number().int().nonnegative('Valor não pode ser negativo'),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type SaveSnapshotInput = z.infer<typeof saveSnapshotSchema>;

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

  const workspaceId = await requireActiveWorkspaceId();
  const monthDate =
    parsed.data.monthDate ??
    format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const [existing] = await db
    .select()
    .from(schema.assetsSnapshots)
    .where(
      and(
        eq(schema.assetsSnapshots.workspaceId, workspaceId),
        eq(schema.assetsSnapshots.date, monthDate)
      )
    )
    .limit(1);

  let id: string;
  if (existing) {
    id = existing.id;
    await db
      .update(schema.assetsSnapshots)
      .set({
        investments: parsed.data.investments,
        notes: parsed.data.notes ?? null,
      })
      .where(eq(schema.assetsSnapshots.id, id));
  } else {
    id = ulid();
    await db.insert(schema.assetsSnapshots).values({
      id,
      workspaceId,
      date: monthDate,
      accountId: null,
      investments: parsed.data.investments,
      notes: parsed.data.notes ?? null,
    });
  }

  try {
    revalidatePath('/patrimonio');
    revalidatePath('/');
  } catch {
    /* fora de contexto Next */
  }

  return { ok: true, data: { id } };
}

export async function deleteSnapshot(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'ID obrigatório' };

  const workspaceId = await requireActiveWorkspaceId();
  const result = await db
    .delete(schema.assetsSnapshots)
    .where(
      and(
        eq(schema.assetsSnapshots.workspaceId, workspaceId),
        eq(schema.assetsSnapshots.id, id)
      )
    )
    .returning({ id: schema.assetsSnapshots.id });

  if (result.length === 0) {
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
