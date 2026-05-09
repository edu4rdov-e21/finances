import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import * as schema from './schema';

/**
 * Popula o DB com as contas do Eduardo e categorias default.
 * Idempotente: se a conta/categoria já existe (por nome), pula.
 *
 * Rodar com: `npm run seed`
 */

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? './data/financas.db';
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

const ACCOUNTS_SEED: schema.NewAccount[] = [
  {
    id: ulid(),
    name: 'Amex Pessoal',
    kind: 'credit_card',
    ownership: 'PF',
    initialBalance: 0,
    closingDay: null, // Eduardo confirma em /config
    dueDay: null,
  },
  {
    id: ulid(),
    name: 'Itaú PF',
    kind: 'checking',
    ownership: 'PF',
    initialBalance: 0,
  },
  {
    id: ulid(),
    name: 'Cora PF',
    kind: 'checking',
    ownership: 'PF',
    initialBalance: 0,
  },
  {
    id: ulid(),
    name: 'XP Empresa',
    kind: 'credit_card',
    ownership: 'PJ',
    initialBalance: 0,
    closingDay: null,
    dueDay: null,
  },
  {
    id: ulid(),
    name: 'InfinitePay PJ',
    kind: 'checking',
    ownership: 'PJ',
    initialBalance: 0,
  },
];

const EXPENSE_CATEGORIES: Array<Omit<schema.NewCategory, 'id' | 'kind'>> = [
  { name: 'Mercado', ownership: 'PF', icon: 'shopping-cart' },
  { name: 'Transporte', ownership: 'both', icon: 'car' },
  { name: 'Lazer', ownership: 'PF', icon: 'sparkles' },
  { name: 'Saúde', ownership: 'PF', icon: 'heart' },
  { name: 'Casa', ownership: 'PF', icon: 'home' },
  { name: 'Assinaturas', ownership: 'both', icon: 'repeat' },
  { name: 'Educação', ownership: 'both', icon: 'book-open' },
  { name: 'Trabalho', ownership: 'both', icon: 'briefcase' },
  { name: 'Impostos', ownership: 'both', icon: 'receipt' },
  { name: 'Tarifas Bancárias', ownership: 'both', icon: 'banknote' },
  { name: 'Transferência', ownership: 'both', icon: 'arrow-right-left' },
  { name: 'Outros', ownership: 'both', icon: 'circle' },
];

const INCOME_CATEGORIES: Array<Omit<schema.NewCategory, 'id' | 'kind'>> = [
  { name: 'Salário', ownership: 'PF', icon: 'wallet' },
  { name: 'Freelance', ownership: 'PF', icon: 'pen-tool' },
  { name: 'Faturamento PJ', ownership: 'PJ', icon: 'trending-up' },
  { name: 'Reembolso', ownership: 'both', icon: 'undo-2' },
  { name: 'Transferência', ownership: 'both', icon: 'arrow-right-left' },
  { name: 'Outros', ownership: 'both', icon: 'circle' },
];

async function seed() {
  console.log('Populando contas...');
  for (const account of ACCOUNTS_SEED) {
    const existing = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.name, account.name))
      .all();
    if (existing.length === 0) {
      db.insert(schema.accounts).values(account).run();
      console.log(`  ✓ ${account.name}`);
    } else {
      console.log(`  - ${account.name} (já existe)`);
    }
  }

  console.log('\nPopulando categorias de despesa...');
  for (const cat of EXPENSE_CATEGORIES) {
    const existing = db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.name, cat.name),
          eq(schema.categories.kind, 'expense')
        )
      )
      .all();
    if (existing.length === 0) {
      const full: schema.NewCategory = { ...cat, id: ulid(), kind: 'expense' };
      db.insert(schema.categories).values(full).run();
      console.log(`  + ${cat.name}`);
    } else {
      console.log(`  - ${cat.name} (já existe)`);
    }
  }

  console.log('\nPopulando categorias de entrada...');
  for (const cat of INCOME_CATEGORIES) {
    const existing = db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.name, cat.name),
          eq(schema.categories.kind, 'income')
        )
      )
      .all();
    if (existing.length === 0) {
      const full: schema.NewCategory = { ...cat, id: ulid(), kind: 'income' };
      db.insert(schema.categories).values(full).run();
      console.log(`  + ${cat.name}`);
    } else {
      console.log(`  - ${cat.name} (já existe)`);
    }
  }

  console.log('\nSeed completo. Ajuste saldos iniciais e dias de fechamento/vencimento em /config.');
}

seed().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
