import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT) || 3000

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Hono server listening on http://localhost:${info.port}`)
  })
}

export default app
