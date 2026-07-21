import type { Context, Next } from 'hono'
import { getValidSession, renewSession } from '../auth.ts'
import { clearSessionCookie, issueSessionCookie, readSignedSessionId } from '../cookies.ts'

/**
 * Gate for every /api/* route registered AFTER this middleware in
 * index.ts (AUTH-05, route-order-as-access-control). Reads the signed
 * session cookie via the shared reader (readSignedSessionId — the same
 * one GET /status uses, so session validation is defined exactly once),
 * rejects with a generic 401 on missing/tampered/expired sessions, and
 * rolls a valid session's expiry forward on every authenticated hit
 * (D-01 rolling renewal).
 */
export async function authMiddleware(c: Context, next: Next) {
  const sessionId = await readSignedSessionId(c)
  if (!sessionId) {
    // Falsy covers both "no cookie" and "tampered signature" — same
    // response either way (T-04-02).
    return c.json({ error: 'unauthorized' }, 401)
  }

  const session = getValidSession(sessionId)
  if (!session) {
    clearSessionCookie(c)
    return c.json({ error: 'unauthorized' }, 401)
  }

  renewSession(sessionId)
  await issueSessionCookie(c, sessionId)
  c.set('sessionId', sessionId)

  await next()
}
