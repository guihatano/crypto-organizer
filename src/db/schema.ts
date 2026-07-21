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
 *
 * grupo08Subcodigo (Phase 3, D-07) stores the Grupo 08 (Criptoativos)
 * sub-código used in the Discriminação text. Plain nullable TEXT with NO
 * value constraint — Receita Federal can renumber these codes year to
 * year, so this field must never become an enum/CHECK constraint
 * (Pitfall 3). User-editable; the report reads whatever is currently set.
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
  grupo08Subcodigo: text('grupo08_subcodigo'),
})

/**
 * exchanges — seeded + user-extendable list of exchanges.
 * cnpj (Phase 3, D-09) feeds the Discriminação text's custody-location
 * clause; nullable TEXT, no format constraint (D-08: missing/malformed
 * CNPJ never blocks report generation, produced with a placeholder
 * instead). Purely additive `ALTER TABLE ... ADD COLUMN`, never touches
 * existing rows or the ledger/cost data path.
 */
export const exchanges = sqliteTable('exchanges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  cnpj: text('cnpj'),
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

/**
 * auth_credentials — the single-user login credential (Phase 4, AUTH-01/AUTH-06).
 * There is exactly one row in this table; its existence is the source of
 * truth behind the first-run setup gate. password_hash is the ONLY form
 * the password ever takes at rest — an Argon2id hash, never plaintext or
 * any reversible encoding. failed_attempts/last_failed_at back the D-02
 * brute-force backoff (never a hard permanent lockout).
 */
export const authCredentials = sqliteTable('auth_credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lastFailedAt: text('last_failed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * sessions — server-validated session store (Phase 4, D-01/AUTH-03/AUTH-04).
 * `id` is an opaque random UUID (node:crypto randomUUID()), NOT an
 * autoincrement integer — it doubles as the session token carried inside
 * the signed cookie. expires_at is the server-side authority for
 * validity; the cookie's own maxAge is never trusted alone. Deleting a
 * row is how a session is revoked (AUTH-03).
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export type Coin = typeof coins.$inferSelect
export type NewCoin = typeof coins.$inferInsert
export type Exchange = typeof exchanges.$inferSelect
export type NewExchange = typeof exchanges.$inferInsert
export type TransactionRow = typeof transactions.$inferSelect
export type NewTransactionRow = typeof transactions.$inferInsert
export type AuthCredential = typeof authCredentials.$inferSelect
export type NewAuthCredential = typeof authCredentials.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
