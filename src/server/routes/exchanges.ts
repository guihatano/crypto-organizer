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
      cnpj: row.cnpj,
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

interface PatchExchangeBody {
  cnpj?: string | null
}

/**
 * Saves the exchange's CNPJ (IR-04), consumed by the Discriminação text's
 * custody-location clause. Deliberately does NOT validate format or check
 * digits — D-08 says a missing/malformed CNPJ must never block report
 * generation; the user can hand-correct it in the IRPF program. Trim only,
 * so a blank/whitespace-only value stores null rather than an empty
 * string.
 */
exchangesRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Id inválido.' }, 400)
  }

  const body = await c.req.json<PatchExchangeBody>().catch(() => null)
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const existing = db.select().from(exchanges).where(eq(exchanges.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Exchange não encontrada.' }, 404)
  }

  const now = new Date().toISOString()
  const updated = db
    .update(exchanges)
    .set({ cnpj: body.cnpj?.trim() || null, updatedAt: now })
    .where(eq(exchanges.id, id))
    .returning()
    .get()

  return c.json({ id: updated.id, name: updated.name, cnpj: updated.cnpj })
})
