import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Conexão Postgres (Supabase) compartilhada pelo app.
 *
 * Em dev (Next.js HMR) e prod (serverless Vercel), o módulo pode ser
 * avaliado várias vezes — o singleton em globalThis previne abrir conexões
 * extras a cada hot-reload.
 *
 * Usa Supabase pooler (transaction mode) — `prepare: false` é necessário
 * porque pgbouncer com transaction pooling não suporta prepared statements.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgClient__: ReturnType<typeof postgres> | undefined;
}

function getConnectionString(): string {
  // Em testes (Vitest) não há DATABASE_URL; usamos fallback que jamais
  // conecta de fato (postgres-js só conecta na primeira query). Funções
  // puras testadas não chegam a fazer query, então isso é seguro.
  return process.env.DATABASE_URL ?? 'postgresql://invalid_test';
}

const client =
  globalThis.__pgClient__ ??
  (globalThis.__pgClient__ = postgres(getConnectionString(), {
    prepare: false,
    max: 10,
  }));

export const db = drizzle(client, { schema });
export { schema };
