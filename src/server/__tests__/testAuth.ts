import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { sqlite } from '../../db/client.ts'
import { SESSION_COOKIE, cookieOptions } from '../cookies.ts'

/**
 * Seeds a real, non-expired `sessions` row directly via raw SQL
 * (mirroring testDb.ts's seedFixture/seedCoin style) and produces a real
 * signed cookie the exact same way issueSessionCookie() does — never a
 * hand-constructed/unsigned cookie string. This exercises the real
 * authMiddleware in every test that attaches the returned cookieHeader
 * (per CONTEXT.md: auth is never disabled/bypassed in tests).
 */
export async function seedAuthedSession(): Promise<{ cookieHeader: string; sessionId: string }> {
  const sessionId = randomUUID()
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  sqlite
    .prepare('INSERT INTO sessions (id, expires_at, created_at) VALUES (?, ?, ?)')
    .run(sessionId, expiresAt, now)

  // Build a real signed cookie via a throwaway Hono context, capturing
  // the Set-Cookie header's first segment (name=value, no attributes).
  const throwaway = new Hono()
  let cookieHeader = ''
  throwaway.get('/', async (c) => {
    await setSignedCookie(c, SESSION_COOKIE, sessionId, process.env.SESSION_SECRET!, cookieOptions())
    cookieHeader = c.res.headers.get('set-cookie')!.split(';')[0]
    return c.body(null)
  })
  await throwaway.request('/')

  return { cookieHeader, sessionId }
}
