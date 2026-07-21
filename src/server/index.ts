import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { authMiddleware } from './middleware/auth.ts'
import { authRoute } from './routes/auth.ts'
import { coinsRoute } from './routes/coins.ts'
import { exchangesRoute } from './routes/exchanges.ts'
import { irReportRoute } from './routes/irReport.ts'
import { positionsRoute } from './routes/positions.ts'
import { pricesRoute } from './routes/prices.ts'
import { rateRoute } from './routes/rate.ts'
import { transactionsRoute } from './routes/transactions.ts'

// SESSION_SECRET boot fail-fast (D-04): the HMAC key that signs the
// session cookie must come from the environment. No silent default/
// auto-generated secret — a missing/empty value means the server refuses
// to boot at all, with a clear message. (env.setup.ts sets a fixed test
// value before this module is ever imported, so this never fires in the
// test suite.)
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required and must not be empty.')
  process.exit(1)
}

const app = new Hono()

// --- PUBLIC (registered before the gate) ---
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoute) // /setup, /login, /logout, /status

// --- GATE — do not add app.route() calls above this line (AUTH-05). ---
// Everything registered below requires a valid session; this code layout
// IS the access-control list (route-order-as-access-control) — there is
// no separate allowlist/config to consult or drift out of sync.
app.use('/api/*', authMiddleware)

// --- PROTECTED ---
app.route('/api/coins', coinsRoute)
app.route('/api/exchanges', exchangesRoute)
app.route('/api/ir-report', irReportRoute)
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
