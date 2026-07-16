import { db, sqlite } from './client.ts'
import { coins, exchanges } from './schema.ts'

// grupo08Subcodigo: Phase 3 (D-07) seed defaults only — sourced from
// RESEARCH A3's two independent secondary sources (no primary gov.br
// table retrievable). BTC gets '01', stablecoins (USDT/USDC) get '03',
// every other seeded coin gets '02' (outras criptomoedas). These are
// starting values the user can overwrite any time in the Cadastros
// panel — never a runtime lookup, and `onConflictDoNothing` below means
// re-seeding never overwrites a value the user has already edited.
const SEED_COINS: Array<{
  symbol: string
  name: string
  coingeckoId: string
  grupo08Subcodigo: string
}> = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', grupo08Subcodigo: '01' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', grupo08Subcodigo: '02' },
  { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether', grupo08Subcodigo: '03' },
  { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin', grupo08Subcodigo: '03' },
  { symbol: 'BNB', name: 'BNB', coingeckoId: 'binancecoin', grupo08Subcodigo: '02' },
  { symbol: 'XRP', name: 'XRP', coingeckoId: 'ripple', grupo08Subcodigo: '02' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', grupo08Subcodigo: '02' },
  { symbol: 'ADA', name: 'Cardano', coingeckoId: 'cardano', grupo08Subcodigo: '02' },
  { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin', grupo08Subcodigo: '02' },
  { symbol: 'TRX', name: 'TRON', coingeckoId: 'tron', grupo08Subcodigo: '02' },
  { symbol: 'TON', name: 'Toncoin', coingeckoId: 'the-open-network', grupo08Subcodigo: '02' },
  { symbol: 'DOT', name: 'Polkadot', coingeckoId: 'polkadot', grupo08Subcodigo: '02' },
  { symbol: 'MATIC', name: 'Polygon', coingeckoId: 'matic-network', grupo08Subcodigo: '02' },
  { symbol: 'LTC', name: 'Litecoin', coingeckoId: 'litecoin', grupo08Subcodigo: '02' },
  { symbol: 'SHIB', name: 'Shiba Inu', coingeckoId: 'shiba-inu', grupo08Subcodigo: '02' },
  { symbol: 'AVAX', name: 'Avalanche', coingeckoId: 'avalanche-2', grupo08Subcodigo: '02' },
  { symbol: 'LINK', name: 'Chainlink', coingeckoId: 'chainlink', grupo08Subcodigo: '02' },
  { symbol: 'ATOM', name: 'Cosmos', coingeckoId: 'cosmos', grupo08Subcodigo: '02' },
  { symbol: 'XLM', name: 'Stellar', coingeckoId: 'stellar', grupo08Subcodigo: '02' },
  { symbol: 'BCH', name: 'Bitcoin Cash', coingeckoId: 'bitcoin-cash', grupo08Subcodigo: '02' },
]

const SEED_EXCHANGES: Array<{ name: string }> = [
  { name: 'Manual' },
  { name: 'Binance' },
  { name: 'Kraken' },
  { name: 'Coinbase' },
  { name: 'Mercado Bitcoin' },
]

function seed() {
  const now = new Date().toISOString()

  for (const coin of SEED_COINS) {
    db.insert(coins)
      .values({ ...coin, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: coins.symbol })
      .run()
  }

  for (const exchange of SEED_EXCHANGES) {
    db.insert(exchanges)
      .values({ ...exchange, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: exchanges.name })
      .run()
  }

  const coinCount = sqlite.prepare('select count(*) as n from coins').get() as { n: number }
  const exchangeCount = sqlite.prepare('select count(*) as n from exchanges').get() as {
    n: number
  }
  console.log(`Seeded: ${coinCount.n} coins, ${exchangeCount.n} exchanges`)
}

seed()
