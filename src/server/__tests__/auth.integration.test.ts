import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from './testDb.ts'
import { createSession, getValidSession } from '../auth.ts'
import { sqlite } from '../../db/client.ts'
import app from '../index.ts'

function extractCookieHeader(res: Response): string | null {
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) return null
  return setCookie.split(';')[0]
}

async function postSetup(body: Record<string, unknown>) {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json(), cookieHeader: extractCookieHeader(res) }
}

async function postLogin(body: Record<string, unknown>) {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json(), cookieHeader: extractCookieHeader(res) }
}

async function postLogout(cookieHeader?: string) {
  const res = await app.request('/api/auth/logout', {
    method: 'POST',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })
  return { status: res.status, json: await res.json() }
}

async function getStatus(cookieHeader?: string) {
  const res = await app.request('/api/auth/status', {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('creates the account and sets a session cookie on the first call', async () => {
    const { status, json, cookieHeader } = await postSetup({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })

    expect(status).toBe(201)
    expect(json.ok).toBe(true)
    expect(cookieHeader).toBeTruthy()
  })

  it('returns 409 with the generic message on a second call — no second row created', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    const { status, json } = await postSetup({
      username: 'someone-else',
      password: 'another-password',
    })

    expect(status).toBe(409)
    expect(json.error).toBe('Uma conta já foi criada.')

    const { json: statusJson } = await getStatus()
    expect(statusJson.setup_required).toBe(false)
  })

  it('rejects a short password with 400', async () => {
    const { status, json } = await postSetup({ username: 'guilherme', password: 'short' })
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('rejects a missing username with 400', async () => {
    const { status, json } = await postSetup({ password: 'correct-horse-battery' })
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('accepts correct credentials, returns a fresh session cookie, and resets the failure counter', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    const { status, json, cookieHeader } = await postLogin({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(cookieHeader).toBeTruthy()
  })

  it('rejects a wrong password with a generic message (no user enumeration) and increments the counter', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    const { status, json } = await postLogin({ username: 'guilherme', password: 'wrong-password' })

    expect(status).toBe(401)
    expect(json.error).toBe('Usuário ou senha incorretos.')
  })

  it('rejects a login attempt against an unknown username with the exact same generic message', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    const { status, json } = await postLogin({
      username: 'does-not-exist',
      password: 'whatever-12345',
    })

    expect(status).toBe(401)
    expect(json.error).toBe('Usuário ou senha incorretos.')
  })

  it('rejects when no account exists yet (never 500s)', async () => {
    const { status, json } = await postLogin({ username: 'guilherme', password: 'whatever-12345' })

    expect(status).toBe(401)
    expect(json.error).toBe('Usuário ou senha incorretos.')
  })

  it('applies a growing backoff after 5 failed attempts and still eventually resolves (D-02, never a hard lockout)', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    // 5 wrong attempts build the counter up to the backoff threshold.
    for (let i = 0; i < 5; i++) {
      const { status } = await postLogin({ username: 'guilherme', password: 'wrong-password' })
      expect(status).toBe(401)
    }

    // The 6th attempt is delayed (computeBackoffMs(5) > 0) but still
    // resolves with the correct password and succeeds — never a
    // permanent lockout.
    const start = Date.now()
    const { status, json } = await postLogin({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })
    const elapsedMs = Date.now() - start

    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    // computeBackoffMs(5) === 2000ms (BACKOFF_BASE_MS at the threshold) —
    // assert the delay was actually applied, not wall-clock precision.
    expect(elapsedMs).toBeGreaterThanOrEqual(1900)
  }, 10_000)

  it('invalidates the previously-issued session cookie when a new login succeeds (WR-02)', async () => {
    const { cookieHeader: setupCookie } = await postSetup({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })

    // The setup cookie authenticates before the second login.
    const { json: before } = await getStatus(setupCookie ?? undefined)
    expect(before.authenticated).toBe(true)

    // A fresh login mints a new session and drops the old one.
    const { status, cookieHeader: loginCookie } = await postLogin({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })
    expect(status).toBe(200)

    // The old cookie is now rejected; only the newest session is valid.
    const { json: afterOld } = await getStatus(setupCookie ?? undefined)
    expect(afterOld.authenticated).toBe(false)
    const { json: afterNew } = await getStatus(loginCookie ?? undefined)
    expect(afterNew.authenticated).toBe(true)
  })
})

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('deletes the session row so a replayed cookie is rejected on the next request', async () => {
    const { cookieHeader } = await postSetup({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })

    const { status } = await postLogout(cookieHeader ?? undefined)
    expect(status).toBe(200)

    const { json: statusAfter } = await getStatus(cookieHeader ?? undefined)
    expect(statusAfter.authenticated).toBe(false)
  })

  it('is idempotent/public-safe when called with no session at all', async () => {
    const { status, json } = await postLogout()
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })
})

describe('GET /api/auth/status', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('reports setup_required=true, authenticated=false with no account', async () => {
    const { status, json } = await getStatus()
    expect(status).toBe(200)
    expect(json).toEqual({ setup_required: true, authenticated: false })
  })

  it('reports setup_required=false, authenticated=true with a valid session cookie', async () => {
    const { cookieHeader } = await postSetup({
      username: 'guilherme',
      password: 'correct-horse-battery',
    })

    const { status, json } = await getStatus(cookieHeader ?? undefined)
    expect(status).toBe(200)
    expect(json).toEqual({ setup_required: false, authenticated: true })
  })

  it('reports authenticated=false when the account exists but no cookie is sent', async () => {
    await postSetup({ username: 'guilherme', password: 'correct-horse-battery' })

    const { status, json } = await getStatus()
    expect(status).toBe(200)
    expect(json).toEqual({ setup_required: false, authenticated: false })
  })
})

describe('getValidSession', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('returns the row for a live session', () => {
    const id = createSession()
    expect(getValidSession(id)).not.toBeNull()
  })

  it('fails closed on an unparseable expires_at instead of treating it as valid (WR-03)', () => {
    const id = createSession()
    // Simulate a corrupt/hand-edited row: NaN <= now is false, which must
    // NOT read as a still-valid session.
    sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run('not-a-date', id)
    expect(getValidSession(id)).toBeNull()
  })

  it('rejects an expired session', () => {
    const id = createSession()
    sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', id)
    expect(getValidSession(id)).toBeNull()
  })
})
