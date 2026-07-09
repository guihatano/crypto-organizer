import type { Decimal } from '../lib/decimal.ts'

/**
 * Raw transaction as read from the DB (TEXT string amounts). The engine
 * only needs these fields — it has zero knowledge of DB row ids, exchange
 * names, etc.
 */
export interface Transaction {
  id: string | number
  date: string // ISO YYYY-MM-DD
  type: 'buy' | 'sell'
  coinId: string | number
  quantity: string
  valueBrl: string
  feeBrl: string
  createdAt: string
}

/**
 * A candidate sell transaction being validated before insert/update — same
 * shape as Transaction minus the fields that don't matter for chronological
 * validation, plus an optional id (absent when creating a brand-new sell).
 */
export interface CandidateSell {
  id?: string | number
  date: string
  coinId: string | number
  quantity: string
}

/**
 * Derived, in-memory position for a single coin. NEVER persisted — always
 * recomputed from the full ledger (POS-01).
 */
export interface Position {
  coinId: string | number
  quantity: Decimal
  precoMedio: Decimal
  custoTotal: Decimal
}

export interface SellValidationResult {
  valid: boolean
  reason?: string
}
