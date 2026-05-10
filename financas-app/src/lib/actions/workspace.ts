'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db/client';
import {
  setActiveWorkspaceCookie,
  clearActiveWorkspaceCookie,
} from '@/lib/workspace';
import type { ActionResult } from './types';

const enterSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Digite seu código')
    .max(100)
    .transform((v) => v.toLowerCase()),
});

export type EnterInput = z.infer<typeof enterSchema>;

/**
 * Login por código. Case-insensitive (transform pra lowercase).
 * Se válido, seta cookie e redireciona pra /. Senão, retorna erro.
 */
export async function enterWorkspace(
  input: EnterInput
): Promise<ActionResult> {
  const parsed = enterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Código inválido',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.code, parsed.data.code))
    .limit(1);

  if (!ws) {
    return {
      ok: false,
      error: 'Código não encontrado.',
    };
  }

  await setActiveWorkspaceCookie(ws.id);
  redirect('/');
}

export async function leaveWorkspace(): Promise<void> {
  await clearActiveWorkspaceCookie();
  redirect('/entrar');
}
