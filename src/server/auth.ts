import argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { authCredentials, sessions } from '../db/schema.ts'
import type { AuthCredential, Session } from '../db/schema.ts'

/**
 * Argon2id hashing options per OWASP's current lower-RAM recommendation
 * (m=19456 KiB, t=2, p=1) — deliberately overrides the library's weaker
 * defaults (m=4096, t=3). AUTH-06.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/** Hashes a plaintext password into an Argon2id string. Never sync, never sha256/md5/bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

/**
 * Verifies a plaintext password against a stored hash. Resolves `false`
 * on a wrong password AND on any malformed/unexpected hash input — a
 * verification failure must read as "login rejected," never crash the
 * route (AUTH-06).
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/** Returns the single auth_credentials row, or null if first-run setup hasn't happened yet (AUTH-01). */
export function getCredential(): AuthCredential | null {
  const row = db.select().from(authCredentials).get()
  return row ?? null
}

/** Creates the single auth_credentials row (first-run setup, AUTH-01). */
export function createCredential(username: string, passwordHash: string): AuthCredential {
  const now = new Date().toISOString()
  const result = db
    .insert(authCredentials)
    .values({
      username,
      passwordHash,
      failedAttempts: 0,
      lastFailedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
  return result
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days (D-01)

function sessionExpiryFromNow(): string {
  return new Date(Date.now() + SESSION_DURATION_MS).toISOString()
}

/**
 * Creates a new session row with a random opaque id and expires_at = now +
 * 7 days. Returns the session id.
 *
 * This is a single-user app, so at most one session should ever be valid:
 * before inserting, every prior session row is deleted. That (a) bounds the
 * table so rows never accumulate unbounded, and (b) invalidates any
 * previously-issued cookie on each new setup/login, so an older captured
 * cookie can no longer outlive a fresh login for up to 7 days (WR-02).
 */
export function createSession(): string {
  db.delete(sessions).run()
  const id = randomUUID()
  const now = new Date().toISOString()
  db.insert(sessions)
    .values({
      id,
      expiresAt: sessionExpiryFromNow(),
      createdAt: now,
    })
    .run()
  return id
}

/**
 * Returns the session row only if it exists and its server-side
 * expires_at is still in the future (D-01, AUTH-04) — the DB row is the
 * authority, never the cookie's own maxAge.
 */
export function getValidSession(sessionId: string): Session | null {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!row) return null
  // Fail closed: an unparseable expires_at yields NaN, and `NaN <= now` is
  // false, which would otherwise treat a corrupt row as a valid session. An
  // auth validity check must reject on any timestamp it cannot trust.
  const expiry = new Date(row.expiresAt).getTime()
  if (Number.isNaN(expiry) || expiry <= Date.now()) return null
  return row
}

/** Rolls a session's expiry forward to now + 7 days (D-01). */
export function renewSession(sessionId: string): void {
  db.update(sessions).set({ expiresAt: sessionExpiryFromNow() }).where(eq(sessions.id, sessionId)).run()
}

/** Deletes a session row — server-side revocation (AUTH-03). */
export function revokeSession(sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run()
}

/** Increments the credential's failed-attempt counter and stamps last_failed_at (D-02). */
export function registerFailedAttempt(): void {
  const credential = getCredential()
  if (!credential) return
  db.update(authCredentials)
    .set({
      failedAttempts: credential.failedAttempts + 1,
      lastFailedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(authCredentials.id, credential.id))
    .run()
}

/** Resets the failed-attempt counter on a successful login (D-02). */
export function resetFailedAttempts(): void {
  const credential = getCredential()
  if (!credential) return
  db.update(authCredentials)
    .set({
      failedAttempts: 0,
      lastFailedAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(authCredentials.id, credential.id))
    .run()
}

const BACKOFF_THRESHOLD = 5
const BACKOFF_BASE_MS = 2000 // 2s
const BACKOFF_MAX_MS = 30_000 // 30s cap — D-02 forbids a permanent lockout

/**
 * Returns the login backoff delay for a given failed-attempt count: 0
 * below the threshold, then an exponential delay starting at 2s and
 * doubling, capped at 30s so a user can never be permanently locked out
 * (D-02).
 */
export function computeBackoffMs(failedAttempts: number): number {
  if (failedAttempts < BACKOFF_THRESHOLD) return 0
  const exponent = failedAttempts - BACKOFF_THRESHOLD
  const delay = BACKOFF_BASE_MS * 2 ** exponent
  return Math.min(delay, BACKOFF_MAX_MS)
}
