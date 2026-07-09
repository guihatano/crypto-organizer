import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.ts'

const DB_PATH = process.env.DATABASE_PATH || 'app.db'

// better-sqlite3 is synchronous — ideal for a single-user local app
// (simpler code, no callback hell) per CLAUDE.md.
const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { sqlite }
