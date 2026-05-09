import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

/**
 * Conexão SQLite compartilhada pelo app.
 *
 * Em dev, o Next.js recarrega módulos a cada save (hot reload). Sem cache no
 * `globalThis`, cada reload abriria uma conexão nova com o arquivo `.db` e
 * vazaria recursos. O truque abaixo guarda a conexão num símbolo global e
 * reaproveita entre reloads.
 *
 * Em produção (build), o módulo é avaliado uma única vez — o cache é inerte.
 */

const DB_PATH =
  process.env.DATABASE_URL?.replace(/^file:/, '') ?? './data/financas.db';

declare global {
  // eslint-disable-next-line no-var
  var __sqlite__: Database.Database | undefined;
}

const sqlite =
  globalThis.__sqlite__ ??
  (globalThis.__sqlite__ = new Database(DB_PATH));

// WAL mode: melhor performance e suporta leitura concorrente com escrita.
sqlite.pragma('journal_mode = WAL');
// Foreign keys ligadas: garante referential integrity (sem isso, o SQLite
// aceita inserir uma transaction com account_id que não existe).
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
