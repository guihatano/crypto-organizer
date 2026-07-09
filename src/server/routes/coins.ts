import { Hono } from 'hono'
import { db } from '../../db/client.ts'
import { coins } from '../../db/schema.ts'

export const coinsRoute = new Hono()

coinsRoute.get('/', (c) => {
  const rows = db.select().from(coins).all()
  return c.json(
    rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      coingecko_id: row.coingeckoId,
    })),
  )
})
