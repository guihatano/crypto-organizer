import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { coins } from '../../db/schema.ts'
import { getRateWithFallback, type RateResult } from '../coingecko.ts'

export const rateRoute = new Hono()

/**
 * GET /api/rate?from=USDT&date=YYYY-MM-DD
 * Never throws / never 500s — degrades to {rate: null, source:
 * 'unavailable'} on any failure so the client's manual-override input is
 * always usable (D-06).
 */
rateRoute.get('/', async (c) => {
  const from = c.req.query('from')
  const date = c.req.query('date')

  if (!from || !date) {
    return c.json<RateResult>({ rate: null, source: 'unavailable' })
  }

  const coin = db.select().from(coins).where(eq(coins.symbol, from.toUpperCase())).get()
  if (!coin) {
    return c.json<RateResult>({ rate: null, source: 'unavailable' })
  }

  const result = await getRateWithFallback(coin.coingeckoId, date)
  return c.json(result)
})
