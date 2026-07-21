import { Hono } from 'hono'
import {
  computeBackoffMs,
  createCredential,
  createSession,
  getCredential,
  getValidSession,
  hashPassword,
  registerFailedAttempt,
  resetFailedAttempts,
  revokeSession,
  verifyPassword,
} from '../auth.ts'
import { clearSessionCookie, issueSessionCookie, readSignedSessionId } from '../cookies.ts'

export const authRoute = new Hono()

interface SetupBody {
  username?: string
  password?: string
}

interface LoginBody {
  username?: string
  password?: string
}

/**
 * setup_required/authenticated are both derived from server state on
 * every call — never a client-side flag (D-05). authenticated reuses the
 * exact same readSignedSessionId + getValidSession pair authMiddleware
 * uses, so session validation logic is never duplicated.
 */
authRoute.get('/status', async (c) => {
  const hasAccount = getCredential() != null
  const sessionId = await readSignedSessionId(c)
  const authenticated = !!sessionId && getValidSession(sessionId) != null
  return c.json({ setup_required: !hasAccount, authenticated })
})

/**
 * First-run setup gate (AUTH-01): the server, not the client, decides
 * whether setup is still allowed. This check fires even if the frontend
 * should never have shown the form. A concurrent double-submit race is
 * closed by the UNIQUE constraint on username — a duplicate insert
 * throws and is caught below, surfacing as the same generic 409.
 */
authRoute.post('/setup', async (c) => {
  if (getCredential() != null) {
    return c.json({ error: 'Uma conta já foi criada.' }, 409)
  }

  const body = await c.req.json<SetupBody>().catch(() => null)
  if (!body || !body.username || !body.password || body.password.length < 8) {
    return c.json({ error: 'Dados inválidos.' }, 400)
  }

  let credential
  try {
    credential = createCredential(body.username, await hashPassword(body.password))
  } catch {
    return c.json({ error: 'Uma conta já foi criada.' }, 409)
  }

  // Setup logs the user straight in — a fresh session, never a
  // pre-existing/pre-login token (session-fixation guard).
  const sessionId = createSession()
  await issueSessionCookie(c, sessionId)

  return c.json({ ok: true, username: credential.username }, 201)
})

/**
 * Login (AUTH-02) with D-02 exponential backoff after 5 failed attempts.
 * The delay is awaited BEFORE responding (never a sync/busy sleep) and
 * is applied whenever a credential exists, regardless of whether this
 * particular attempt turns out right or wrong — so the backoff itself
 * never leaks which field is wrong. Every failure path (missing body,
 * unknown username, wrong password) returns the exact same generic
 * message and status (no user enumeration, T-04-12).
 */
authRoute.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => null)
  const credential = getCredential()

  const delay = credential ? computeBackoffMs(credential.failedAttempts) : 0
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  const genericFailure = () => {
    if (credential) registerFailedAttempt()
    return c.json({ error: 'Usuário ou senha incorretos.' }, 401)
  }

  if (!body || !body.username || !body.password || !credential) {
    return genericFailure()
  }
  if (body.username !== credential.username) {
    return genericFailure()
  }

  const valid = await verifyPassword(credential.passwordHash, body.password)
  if (!valid) {
    return genericFailure()
  }

  resetFailedAttempts()
  // A fresh randomUUID session on every successful login — never reuse
  // a pre-login token (session fixation guard).
  const sessionId = createSession()
  await issueSessionCookie(c, sessionId)

  return c.json({ ok: true })
})

/**
 * Logout (AUTH-03): deletes the server-side session row so a replayed
 * cookie is rejected on the next request, then always clears the cookie.
 * /logout is a PUBLIC route (mounted before the auth gate — Task 3), so
 * authMiddleware never runs ahead of it; the shared readSignedSessionId
 * reader is the single source for the session id here, same as /status.
 * Public-safe and idempotent — calling it with no session still
 * succeeds.
 */
authRoute.post('/logout', async (c) => {
  const sessionId = await readSignedSessionId(c)
  if (sessionId) {
    revokeSession(sessionId)
  }
  clearSessionCookie(c)
  return c.json({ ok: true })
})
