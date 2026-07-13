import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { coinsRoute } from './routes/coins.ts'
import { exchangesRoute } from './routes/exchanges.ts'
import { positionsRoute } from './routes/positions.ts'
import { pricesRoute } from './routes/prices.ts'
import { rateRoute } from './routes/rate.ts'
import { transactionsRoute } from './routes/transactions.ts'

const app = new Hono()

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/coins', coinsRoute)
app.route('/api/exchanges', exchangesRoute)
app.route('/api/positions', positionsRoute)
app.route('/api/prices', pricesRoute)
app.route('/api/transactions', transactionsRoute)
app.route('/api/rate', rateRoute)

const port = Number(process.env.PORT) || 3000

// VITEST is always set by the Vitest runtime; NODE_ENV=test is a common
// convention some tooling relies on too. Either guards against binding a
// real port while running the integration test suite.
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Hono server listening on http://localhost:${info.port}`)
  })
}

export default app
