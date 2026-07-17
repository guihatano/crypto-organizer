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
      grupo08_subcodigo: row.grupo08Subcodigo,
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

interface PatchCoinBody {
  grupo08_subcodigo?: string | null
}

/**
 * Saves the coin's Grupo 08 sub-código (D-07), consumed by the
 * Discriminação text. Free text with NO allowed-value list — Receita
 * Federal renumbers these codes between filing years, which is exactly
 * why this stays a stored, user-editable field instead of application
 * logic. Trim only, so a blank/whitespace-only value stores null.
 */
coinsRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Id inválido.' }, 400)
  }

  const body = await c.req.json<PatchCoinBody>().catch(() => null)
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const existing = db.select().from(coins).where(eq(coins.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Moeda não encontrada.' }, 404)
  }

  const now = new Date().toISOString()
  const updated = db
    .update(coins)
    .set({ grupo08Subcodigo: body.grupo08_subcodigo?.trim() || null, updatedAt: now })
    .where(eq(coins.id, id))
    .returning()
    .get()

  return c.json({ id: updated.id, symbol: updated.symbol, grupo08_subcodigo: updated.grupo08Subcodigo })
})
