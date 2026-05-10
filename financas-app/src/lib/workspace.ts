import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

const COOKIE_NAME = 'active_workspace_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export type ActiveWorkspace = {
  id: string;
  code: string;
  name: string;
};

/**
 * Lê o workspace ativo do cookie e valida no banco.
 * Retorna null se não tem cookie OU se o cookie aponta pra workspace deletado.
 */
export async function getActiveWorkspace(): Promise<ActiveWorkspace | null> {
  const store = await cookies();
  const id = store.get(COOKIE_NAME)?.value;
  if (!id) return null;

  const [row] = await db
    .select({
      id: schema.workspaces.id,
      code: schema.workspaces.code,
      name: schema.workspaces.name,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Versão estrita: lança redirect pra /entrar se não houver workspace.
 * Use em pages e Server Actions que exigem login.
 */
export async function requireActiveWorkspace(): Promise<ActiveWorkspace> {
  const ws = await getActiveWorkspace();
  if (!ws) redirect('/entrar');
  return ws;
}

/** Atalho — retorna só o id, simplifica chamadas. */
export async function requireActiveWorkspaceId(): Promise<string> {
  const ws = await requireActiveWorkspace();
  return ws.id;
}

export async function setActiveWorkspaceCookie(workspaceId: string) {
  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: workspaceId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearActiveWorkspaceCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
