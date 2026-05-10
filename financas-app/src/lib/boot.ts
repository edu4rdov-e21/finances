import { generateRecurringTransactions } from './recurring';

const THROTTLE_MS = 60_000;

// Throttle por workspace pra não rodar à toa em cada page-load
const lastRunByWorkspace = new Map<string, number>();

/**
 * Garante que recorrências do workspace estejam materializadas pros
 * próximos 12 meses. Idempotente + throttled por workspace.
 */
export async function ensureRecurringGenerated(
  workspaceId: string
): Promise<void> {
  const now = Date.now();
  const lastRun = lastRunByWorkspace.get(workspaceId) ?? 0;
  if (now - lastRun < THROTTLE_MS) return;
  lastRunByWorkspace.set(workspaceId, now);

  try {
    await generateRecurringTransactions(workspaceId);
  } catch (err) {
    console.error('[ensureRecurringGenerated] failed:', err);
  }
}
