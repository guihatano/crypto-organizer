// DATABASE_PATH=':memory:' is set by env.setup.ts (a Vitest `setupFiles`
// entry) BEFORE this file's module graph is evaluated, so `client.ts`
// below opens an isolated in-memory database instead of the real
// `app.db` file used by `npm run dev`. See env.setup.ts for why the
// assignment can't live here instead (Vite SSR import-evaluation order).
import { sqlite } from '../../db/client.ts'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS coins (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  coingecko_id text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  last_price_brl text,
  last_price_usd text,
  fetched_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS coins_symbol_unique ON coins (symbol);

CREATE TABLE IF NOT EXISTS exchanges (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS exchanges_name_unique ON exchanges (name);

CREATE TABLE IF NOT EXISTS transactions (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  coin_id integer NOT NULL,
  quantity text NOT NULL,
  value_brl text NOT NULL,
  fee_brl text NOT NULL,
  exchange_id integer,
  origin text DEFAULT 'manual' NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  FOREIGN KEY (coin_id) REFERENCES coins(id) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON UPDATE no action ON DELETE no action
);
CREATE INDEX IF NOT EXISTS idx_transactions_coin_date ON transactions (coin_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_date_created ON transactions (date, created_at);
`

let schemaCreated = false

/**
 * Creates the schema once (idempotent) and clears all rows so each test
 * starts from a known-empty state. Call from `beforeEach`.
 */
export function resetTestDb(): void {
  if (!schemaCreated) {
    sqlite.exec(SCHEMA_SQL)
    schemaCreated = true
  }
  sqlite.exec('DELETE FROM transactions; DELETE FROM coins; DELETE FROM exchanges;')
}

export interface SeedFixture {
  coinId: number
  exchangeId: number
}

/**
 * Seeds one coin (BTC) and one exchange (Manual) — the minimum fixture
 * most transaction tests need.
 */
export function seedFixture(): SeedFixture {
  const now = new Date().toISOString()
  const coin = sqlite
    .prepare(
      'INSERT INTO coins (symbol, name, coingecko_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('BTC', 'Bitcoin', 'bitcoin', now, now)
  const exchange = sqlite
    .prepare('INSERT INTO exchanges (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run('Manual', now, now)

  return {
    coinId: Number(coin.lastInsertRowid),
    exchangeId: Number(exchange.lastInsertRowid),
  }
}

/**
 * Seeds a coin with an arbitrary symbol/coingeckoId — used by rate-lookup
 * tests that need a specific symbol (e.g. USDT -> tether).
 */
export function seedCoin(symbol: string, name: string, coingeckoId: string): number {
  const now = new Date().toISOString()
  const coin = sqlite
    .prepare(
      'INSERT INTO coins (symbol, name, coingecko_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(symbol, name, coingeckoId, now, now)
  return Number(coin.lastInsertRowid)
}

/**
 * Directly writes a saved price-cache row (last_price_brl/usd + fetched_at)
 * for a coin, bypassing the prices route — used by tests that need a
 * pre-existing cached value (stale-fallback / cache-only scenarios, D-08).
 */
export function setCoinPriceCache(
  coinId: number,
  values: { lastPriceBrl: string | null; lastPriceUsd: string | null; fetchedAt: string | null },
): void {
  sqlite
    .prepare('UPDATE coins SET last_price_brl = ?, last_price_usd = ?, fetched_at = ? WHERE id = ?')
    .run(values.lastPriceBrl, values.lastPriceUsd, values.fetchedAt, coinId)
}
