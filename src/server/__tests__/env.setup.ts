// Vitest `setupFiles` entry — guaranteed to run BEFORE each test file's own
// module graph is evaluated. This is the ONLY reliable place to set
// DATABASE_PATH ahead of `src/db/client.ts` opening its connection.
//
// Setting this env var at the top of testDb.ts (textually before its own
// `import { sqlite } from '../../db/client.ts'` line) does NOT work: Vite's
// SSR module runner resolves and evaluates a file's static imports before
// that file's own top-level statements run, so client.ts's
// `new Database(process.env.DATABASE_PATH || 'app.db')` was executing
// while DATABASE_PATH was still undefined — silently opening the real
// app.db file instead of an isolated in-memory database, and
// resetTestDb()'s DELETE statements were wiping its rows on every run.
process.env.DATABASE_PATH = ':memory:'

// Fixed test value so signed cookies (session cookie HMAC) verify
// consistently across the whole run — same reasoning as DATABASE_PATH
// above: this must be set before src/server/cookies.ts or index.ts is
// ever imported (Plan 04-02).
process.env.SESSION_SECRET = 'test-session-secret-do-not-use-in-prod'
