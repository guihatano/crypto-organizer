import { Hono } from 'hono'
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
