import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * coins — seeded + user-extendable list of cryptocurrencies.
 * coingecko_id is NOT NULL from day one so Phase 2 (market prices) can plug
 * in without a schema migration (D-01).
 *
 * lastPriceBrl/lastPriceUsd/fetchedAt (Phase 2, D-03) cache the last
 * successfully fetched batch price per coin. All three are nullable TEXT
 * (never REAL, per the Decimal-math rule) — a purely additive ADD COLUMN
 * that never touches the ledger/cost data path. Written ONLY by the
 * prices route; the position engine (cost/preço médio) never reads them.
 */
export const coins = sqliteTable('coins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().unique(),
  name: text('name').notNull(),
  coingeckoId: text('coingecko_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastPriceBrl: text('last_price_brl'),
  lastPriceUsd: text('last_price_usd'),
  fetchedAt: text('fetched_at'),
})

/**
 * exchanges — seeded + user-extendable list of exchanges.
 * No `cnpj` column yet (deferred to Phase 3). Because SQLite supports a
 * plain, non-destructive `ALTER TABLE exchanges ADD COLUMN cnpj TEXT`,
 * this table can gain a nullable `cnpj` later without a migration that
 * touches existing rows (D-11).
 */
export const exchanges = sqliteTable('exchanges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * transactions — the append-only ledger. quantity/value_brl/fee_brl are
 * stored as TEXT (never REAL) so Decimal.js can parse them with zero
 * precision loss (CLAUDE.md Decimal Math rule). `origin` defaults to
 * 'manual' from day one so a future CSV importer only adds rows with a
 * different origin value — no schema change needed (Stack Patterns).
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // ISO YYYY-MM-DD (trade date, not insert date)
    type: text('type', { enum: ['buy', 'sell'] }).notNull(),
    coinId: integer('coin_id')
      .notNull()
      .references(() => coins.id),
    quantity: text('quantity').notNull(),
    valueBrl: text('value_brl').notNull(),
    feeBrl: text('fee_brl').notNull(),
    // Nullable: exchange is optional (product decision, relaxing the
    // original TX-07/D-11 "every entry has an exchange" framing) — a
    // transaction can be recorded without knowing/choosing its exchange.
    exchangeId: integer('exchange_id').references(() => exchanges.id),
    origin: text('origin').notNull().default('manual'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_transactions_coin_date').on(table.coinId, table.date),
    index('idx_transactions_date_created').on(table.date, table.createdAt),
  ],
)

export type Coin = typeof coins.$inferSelect
export type NewCoin = typeof coins.$inferInsert
export type Exchange = typeof exchanges.$inferSelect
export type NewExchange = typeof exchanges.$inferInsert
export type TransactionRow = typeof transactions.$inferSelect
export type NewTransactionRow = typeof transactions.$inferInsert
