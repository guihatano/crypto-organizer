import type { Context } from 'hono'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'

/** Name of the signed cookie that carries the opaque session id. */
export const SESSION_COOKIE = 'session_id'

/** Session lifetime in milliseconds — 7 days (D-01). */
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cookie flags: httpOnly always (T-04-03, JS/XSS can never read the
 * value), sameSite=Lax (T-04-04, sufficient for this same-origin SPA),
 * and secure derived from the environment — NEVER hardcoded to a fixed
 * false (must vary with NODE_ENV so production always requires HTTPS).
 */
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MS / 1000,
  }
}

/** Issues the signed session cookie carrying `sessionId`. */
export async function issueSessionCookie(c: Context, sessionId: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, sessionId, process.env.SESSION_SECRET!, cookieOptions())
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/**
 * Reads and verifies the signed session cookie, returning the session id
 * or `undefined`/`false` if absent/tampered. Callers MUST treat any
 * falsy return as "no session" (T-04-02) — this shared reader is used by
 * both authMiddleware and the /status route (Plan 02) so session
 * validation is defined exactly once.
 */
export async function readSignedSessionId(c: Context): Promise<string | undefined | false> {
  return getSignedCookie(c, process.env.SESSION_SECRET!, SESSION_COOKIE)
}
