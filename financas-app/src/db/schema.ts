import { pgSchema, text, integer } from 'drizzle-orm/pg-core';

/**
 * Schema dedicado pro app de finanças. Mantém isolamento de outras tabelas
 * que possam existir no mesmo Supabase project.
 *
 * Convenções:
 * - id: ULID em text
 * - datas (campos de domínio: transaction.date, etc.): text ISO YYYY-MM-DD
 * - timestamps (createdAt, etc.): text ISO 8601 setado via $defaultFn
 * - valores monetários: SEMPRE centavos em integer (signed); nunca float
 * - booleans: integer 0/1 (mantém compat com refactor mínimo de queries)
 *
 * Workspace-scoped: toda tabela de domínio tem workspaceId FK obrigatório.
 * Cascade no delete do workspace apaga todos os dados associados.
 */
export const financas = pgSchema('financas');

const isoNow = () => new Date().toISOString();

// ==========================================================================
// Workspaces — entrada do sistema. Cada workspace é uma "conta" isolada.
// ==========================================================================
export const workspaces = financas.table('workspaces', {
  id: text('id').primaryKey(),
  /** Código de login (case-insensitive). Único. Ex: "eduardotdmcfxng" */
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Accounts — contas correntes e cartões dentro de um workspace
// ==========================================================================
export const accounts = financas.table('accounts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['checking', 'credit_card'] }).notNull(),
  initialBalance: integer('initial_balance').notNull().default(0),
  currency: text('currency').notNull().default('BRL'),
  closingDay: integer('closing_day'),
  dueDay: integer('due_day'),
  archived: integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Categories
// ==========================================================================
export const categories = financas.table('categories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
  icon: text('icon'),
  color: text('color'),
  archived: integer('archived').notNull().default(0),
});

// ==========================================================================
// Recurring rules
// ==========================================================================
export const recurringRules = financas.table('recurring_rules', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  active: integer('active').notNull().default(1),
});

// ==========================================================================
// Card purchases
// ==========================================================================
export const cardPurchases = financas.table('card_purchases', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id),
  description: text('description').notNull(),
  totalAmount: integer('total_amount').notNull(),
  installments: integer('installments').notNull(),
  firstInstallmentDate: text('first_installment_date').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Import batches
// ==========================================================================
export const importBatches = financas.table('import_batches', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  source: text('source', { enum: ['pdf', 'csv', 'ofx', 'md'] }).notNull(),
  filename: text('filename').notNull(),
  importedAt: text('imported_at').notNull().$defaultFn(isoNow),
  totalRows: integer('total_rows').notNull().default(0),
  status: text('status', {
    enum: ['pending_review', 'confirmed', 'discarded'],
  })
    .notNull()
    .default('pending_review'),
});

// ==========================================================================
// Transactions
// ==========================================================================
export const transactions = financas.table('transactions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  categoryId: text('category_id').references(() => categories.id),
  date: text('date').notNull(),
  amount: integer('amount').notNull(),
  kind: text('kind', {
    enum: ['expense', 'income', 'transfer_out', 'transfer_in'],
  }).notNull(),
  description: text('description').notNull(),
  notes: text('notes'),
  recurringRuleId: text('recurring_rule_id').references(
    () => recurringRules.id
  ),
  cardPurchaseId: text('card_purchase_id').references(
    () => cardPurchases.id
  ),
  transferId: text('transfer_id'),
  importBatchId: text('import_batch_id').references(() => importBatches.id),
  externalHash: text('external_hash'),
  status: text('status', { enum: ['confirmed', 'pending'] })
    .notNull()
    .default('confirmed'),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Assets snapshots (mensais — patrimônio)
// ==========================================================================
export const assetsSnapshots = financas.table('assets_snapshots', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  accountId: text('account_id').references(() => accounts.id),
  investments: integer('investments').notNull().default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Category learnings (aprendizado de import)
// ==========================================================================
export const categoryLearnings = financas.table('category_learnings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  descriptionPattern: text('description_pattern').notNull(),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id),
  weight: integer('weight').notNull().default(1),
  lastUsedAt: text('last_used_at').notNull().$defaultFn(isoNow),
});

// ==========================================================================
// Type exports
// ==========================================================================
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type CardPurchase = typeof cardPurchases.$inferSelect;
export type NewCardPurchase = typeof cardPurchases.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
export type AssetsSnapshot = typeof assetsSnapshots.$inferSelect;
export type NewAssetsSnapshot = typeof assetsSnapshots.$inferInsert;
export type CategoryLearning = typeof categoryLearnings.$inferSelect;
export type NewCategoryLearning = typeof categoryLearnings.$inferInsert;
