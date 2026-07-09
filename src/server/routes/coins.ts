import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
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

interface CreateCoinBody {
  symbol?: string
  name?: string
  coingecko_id?: string
}

/**
 * Adds a user-defined coin (D-02). Rejects duplicates (by symbol) with
 * 400 rather than letting the DB unique-constraint error leak through.
 */
coinsRoute.post('/', async (c) => {
  const body = await c.req.json<CreateCoinBody>().catch(() => null)
  if (!body || !body.symbol?.trim() || !body.name?.trim() || !body.coingecko_id?.trim()) {
    return c.json({ error: 'Campos obrigatórios ausentes: symbol, name, coingecko_id.' }, 400)
  }

  const symbol = body.symbol.trim().toUpperCase()

  const existing = db.select({ id: coins.id }).from(coins).where(eq(coins.symbol, symbol)).get()
  if (existing) {
    return c.json({ error: 'Já existe uma moeda cadastrada com esse símbolo.' }, 400)
  }

  const now = new Date().toISOString()
  const inserted = db
    .insert(coins)
    .values({
      symbol,
      name: body.name.trim(),
      coingeckoId: body.coingecko_id.trim(),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()

  return c.json(
    {
      id: inserted.id,
      symbol: inserted.symbol,
      name: inserted.name,
      coingecko_id: inserted.coingeckoId,
    },
    201,
  )
})
