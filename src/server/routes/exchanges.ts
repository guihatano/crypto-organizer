import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { exchanges } from '../../db/schema.ts'

export const exchangesRoute = new Hono()

exchangesRoute.get('/', (c) => {
  const rows = db.select().from(exchanges).all()
  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
    })),
  )
})

interface CreateExchangeBody {
  name?: string
}

/**
 * Adds a user-defined exchange (D-11). Rejects duplicates (by name) with
 * 400 rather than letting the DB unique-constraint error leak through.
 */
exchangesRoute.post('/', async (c) => {
  const body = await c.req.json<CreateExchangeBody>().catch(() => null)
  if (!body || !body.name?.trim()) {
    return c.json({ error: 'Campo obrigatório ausente: name.' }, 400)
  }

  const name = body.name.trim()

  const existing = db
    .select({ id: exchanges.id })
    .from(exchanges)
    .where(eq(exchanges.name, name))
    .get()
  if (existing) {
    return c.json({ error: 'Já existe uma exchange cadastrada com esse nome.' }, 400)
  }

  const now = new Date().toISOString()
  const inserted = db
    .insert(exchanges)
    .values({ name, createdAt: now, updatedAt: now })
    .returning()
    .get()

  return c.json({ id: inserted.id, name: inserted.name }, 201)
})
