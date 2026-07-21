import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from './testDb.ts'
import { seedAuthedSession } from './testAuth.ts'
import app from '../index.ts'

/**
 * Regression test for AUTH-05 (route-order-as-access-control). The
 * security boundary in src/server/index.ts is pure code layout — no
 * config/allowlist to consult — so this test is the drift alarm for any
 * future route accidentally mounted above the `app.use('/api/*', ...)`
 * gate line (RESEARCH Pitfall 1).
 */
describe('AUTH-05: /api/* gate route-order boundary', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('/api/health stays public with no session cookie', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })

  it('/api/auth/status stays public/reachable with no session cookie', async () => {
    const res = await app.request('/api/auth/status')
    expect(res.status).toBe(200)
  })

  it('a representative protected route (GET /api/transactions) returns 401 without a cookie', async () => {
    const res = await app.request('/api/transactions')
    expect(res.status).toBe(401)
  })

  it('the same protected route returns 200 with a valid seedAuthedSession cookie', async () => {
    const { cookieHeader } = await seedAuthedSession()

    const res = await app.request('/api/transactions', { headers: { Cookie: cookieHeader } })
    expect(res.status).toBe(200)
  })
})
