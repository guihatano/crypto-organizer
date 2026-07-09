import { db, sqlite } from './client.ts'
import { coins, exchanges } from './schema.ts'

const SEED_COINS: Array<{ symbol: string; name: string; coingeckoId: string }> = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum' },
  { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether' },
  { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' },
  { symbol: 'BNB', name: 'BNB', coingeckoId: 'binancecoin' },
  { symbol: 'XRP', name: 'XRP', coingeckoId: 'ripple' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana' },
  { symbol: 'ADA', name: 'Cardano', coingeckoId: 'cardano' },
  { symbol: 'DOGE', name: 'Dogecoin', coingeckoId: 'dogecoin' },
  { symbol: 'TRX', name: 'TRON', coingeckoId: 'tron' },
  { symbol: 'TON', name: 'Toncoin', coingeckoId: 'the-open-network' },
  { symbol: 'DOT', name: 'Polkadot', coingeckoId: 'polkadot' },
  { symbol: 'MATIC', name: 'Polygon', coingeckoId: 'matic-network' },
  { symbol: 'LTC', name: 'Litecoin', coingeckoId: 'litecoin' },
  { symbol: 'SHIB', name: 'Shiba Inu', coingeckoId: 'shiba-inu' },
  { symbol: 'AVAX', name: 'Avalanche', coingeckoId: 'avalanche-2' },
  { symbol: 'LINK', name: 'Chainlink', coingeckoId: 'chainlink' },
  { symbol: 'ATOM', name: 'Cosmos', coingeckoId: 'cosmos' },
  { symbol: 'XLM', name: 'Stellar', coingeckoId: 'stellar' },
  { symbol: 'BCH', name: 'Bitcoin Cash', coingeckoId: 'bitcoin-cash' },
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
