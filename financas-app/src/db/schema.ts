import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Convenções
 * - id: ULID em text (use `ulid` package ou `crypto.randomUUID` no MVP)
 * - datas: ISO 8601 em text (YYYY-MM-DD ou full datetime)
 * - valores: SEMPRE centavos em integer (signed), nunca float
 * - booleanos: integer 0/1
 */

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['checking', 'credit_card'] }).notNull(),
  ownership: text('ownership', { enum: ['PF', 'PJ'] }).notNull(),
  initialBalance: integer('initial_balance').notNull().default(0),
  currency: text('currency').notNull().default('BRL'),
  closingDay: integer('closing_day'),
  dueDay: integer('due_day'),
  archived: integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
  ownership: text('ownership', { enum: ['PF', 'PJ', 'both'] }).notNull().default('both'),
  icon: text('icon'),
  color: text('color'),
  archived: integer('archived').notNull().default(0),
});

export const recurringRules = sqliteTable('recurring_rules', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  categoryId: text('category_id').notNull().references(() => categories.id),
  kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  active: integer('active').notNull().default(1),
});

export const cardPurchases = sqliteTable('card_purchases', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  categoryId: text('category_id').notNull().references(() => categories.id),
  description: text('description').notNull(),
  totalAmount: integer('total_amount').notNull(),
  installments: integer('installments').notNull(),
  firstInstallmentDate: text('first_installment_date').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  source: text('source', { enum: ['pdf', 'csv', 'ofx'] }).notNull(),
  filename: text('filename').notNull(),
  importedAt: text('imported_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  totalRows: integer('total_rows').notNull().default(0),
  status: text('status', {
    enum: ['pending_review', 'confirmed', 'discarded'],
  }).notNull().default('pending_review'),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  categoryId: text('category_id').references(() => categories.id),
  date: text('date').notNull(),
  amount: integer('amount').notNull(),
  kind: text('kind', {
    enum: ['expense', 'income', 'transfer_out', 'transfer_in'],
  }).notNull(),
  description: text('description').notNull(),
  notes: text('notes'),
  recurringRuleId: text('recurring_rule_id').references(() => recurringRules.id),
  cardPurchaseId: text('card_purchase_id').references(() => cardPurchases.id),
  transferId: text('transfer_id'),
  importBatchId: text('import_batch_id').references(() => importBatches.id),
  externalHash: text('external_hash'),
  status: text('status', { enum: ['confirmed', 'pending'] }).notNull().default('confirmed'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assetsSnapshots = sqliteTable('assets_snapshots', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  accountId: text('account_id').references(() => accounts.id),
  investments: integer('investments').notNull().default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categoryLearnings = sqliteTable('category_learnings', {
  id: text('id').primaryKey(),
  descriptionPattern: text('description_pattern').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id),
  weight: integer('weight').notNull().default(1),
  lastUsedAt: text('last_used_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Tipos exportados pra uso em queries e server actions
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
