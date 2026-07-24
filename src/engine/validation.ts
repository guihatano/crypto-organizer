import { toDecimal, ZERO } from '../lib/decimal.ts'
import type { CandidateSell, SellValidationResult, Transaction } from './types.ts'

export interface NegativePoint {
  date: string
}

interface ChronologicalEntry {
  date: string
  createdAt: string
  type: 'buy' | 'sell'
  quantity: string
  isCandidate: boolean
}

function sortChronological(a: ChronologicalEntry, b: ChronologicalEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  // Same date AND same createdAt (candidate vs. an existing row it is
  // replacing on edit): candidate is evaluated last.
  if (a.isCandidate !== b.isCandidate) return a.isCandidate ? 1 : -1
  return 0
}

/**
 * validateSellTransaction replays a coin's transaction history — INCLUDING
 * the candidate sell — in strict chronological order, and rejects the
 * candidate if holdings would go negative at ANY point in that timeline
 * (D-07/D-08). This is stricter than a net-total check: a coin can end at
 * a non-negative total while still going negative mid-timeline if an
 * earlier-dated sell is inserted after a later-dated buy already exists.
 *
 * PURE function: no I/O. Callers (the API route layer) are responsible for
 * fetching `existing` from the DB, scoped to the same coin, and excluding
 * the row being edited if this is an update (this function also filters
 * `existing` defensively by `candidate.id` when present).
 */
export function validateSellTransaction(
  candidate: CandidateSell,
  existing: Transaction[],
): SellValidationResult {
  const sameCoinExisting = existing.filter(
    (tx) => tx.coinId === candidate.coinId && tx.id !== candidate.id,
  )

  const entries: ChronologicalEntry[] = [
    ...sameCoinExisting.map((tx) => ({
      date: tx.date,
      createdAt: tx.createdAt,
      type: tx.type,
      quantity: tx.quantity,
      isCandidate: false,
    })),
    {
      date: candidate.date,
      // The candidate has no createdAt yet (not persisted). Existing rows'
      // createdAt is their real insertion timestamp (unrelated to their
      // trade `date`), so a same-day sentinel would not reliably sort
      // last. Use a fixed far-future sentinel: it only ever competes
      // against entries that share the exact same `date` value (the
      // primary sort key), so this guarantees the candidate is evaluated
      // after every existing row on that trade date, regardless of when
      // those rows were actually inserted.
      createdAt: '9999-12-31T23:59:59.999Z',
      type: 'sell' as const,
      quantity: candidate.quantity,
      isCandidate: true,
    },
  ]

  entries.sort(sortChronological)

  let runningQuantity = ZERO

  for (const entry of entries) {
    const qty = toDecimal(entry.quantity)
    runningQuantity =
      entry.type === 'buy' ? runningQuantity.plus(qty) : runningQuantity.minus(qty)

    if (runningQuantity.lt(0)) {
      return {
        valid: false,
        reason: entry.isCandidate
          ? 'Quantidade insuficiente: esta venda deixaria a posição negativa na data informada.'
          : `Quantidade insuficiente: a posição ficaria negativa em ${entry.date} considerando o histórico completo.`,
      }
    }
  }

  return { valid: true }
}

/**
 * Replays a coin's transaction ledger — as it would exist AFTER a proposed
 * edit or delete has already been applied by the caller — in strict
 * chronological order, and returns the first date at which running
 * quantity would go negative, or null if the timeline never goes negative
 * (D-07/D-08).
 *
 * Unlike validateSellTransaction (which reasons about inserting/editing ONE
 * sell candidate against the rest of the ledger), this validates an
 * already-assembled ledger snapshot. It exists because the invariant
 * "position never goes negative at any point in time" can also be broken
 * by editing a BUY's quantity/date down, or by deleting any transaction —
 * mutation paths validateSellTransaction never sees, since it is only
 * invoked on the sell side.
 *
 * PURE function: no I/O. Caller assembles `ledger`, already scoped to one
 * coin and already reflecting the proposed change.
 */
export function findLedgerNegativePoint(ledger: Transaction[]): NegativePoint | null {
  const sorted = [...ledger].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
    return 0
  })

  let runningQuantity = ZERO

  for (const entry of sorted) {
    const qty = toDecimal(entry.quantity)
    runningQuantity = entry.type === 'buy' ? runningQuantity.plus(qty) : runningQuantity.minus(qty)

    if (runningQuantity.lt(0)) {
      return { date: entry.date }
    }
  }

  return null
}

/**
 * One not-yet-inserted CSV import row, scoped to a single coin (the Map
 * key in validateImportBatch's batchByCoin).
 */
export interface ImportBatchCandidate {
  line: number
  date: string
  type: 'buy' | 'sell'
  quantity: string
}

/**
 * Validates a whole CSV import batch against each touched coin's existing
 * ledger, replaying the SAME negative-position invariant
 * findLedgerNegativePoint already enforces for direct POST
 * /transactions/sell (T-06-06, BACKUP-04) — import must never be a weaker
 * path than manual entry.
 *
 * Each batch row is assigned a synthetic createdAt of "now + its index in
 * milliseconds" (RESEARCH.md Pattern 4): every batch row therefore sorts
 * after every existing row sharing the same date, and ties among batch
 * rows on the same date preserve file order — making the result invariant
 * to the CSV's row order (BACKUP-02 shuffle-invariance truth).
 *
 * PURE aside from one Date.now() read. Does no I/O itself — callers
 * assemble batchByCoin/existingByCoin from already-fetched data. Returns
 * only the FIRST violation found: the caller rejects the entire import on
 * any single violation (all-or-nothing, BACKUP-04), so which one is
 * reported first doesn't change the outcome, only the error message.
 */
export function validateImportBatch(
  batchByCoin: Map<number, ImportBatchCandidate[]>,
  existingByCoin: Map<number, Transaction[]>,
): { line: number; reason: string } | null {
  const runMs = Date.now()

  for (const [coinId, batchRows] of batchByCoin) {
    const synthetic: Transaction[] = batchRows.map((row, i) => ({
      id: `import-${coinId}-${i}`,
      date: row.date,
      type: row.type,
      coinId,
      quantity: row.quantity,
      // Inert placeholders — findLedgerNegativePoint never reads these two
      // fields, only date/createdAt/type/quantity.
      valueBrl: '0',
      feeBrl: '0',
      createdAt: new Date(runMs + i).toISOString(),
    }))

    const ledger = [...(existingByCoin.get(coinId) ?? []), ...synthetic]
    const negative = findLedgerNegativePoint(ledger)
    if (!negative) continue

    // Attribute the violation to the last batch row on/before the
    // negative-crossing date for this coin (RESEARCH.md Open Question 1 —
    // an accepted heuristic; findLedgerNegativePoint itself only returns a
    // date, not a row identity).
    const offender = [...batchRows].reverse().find((row) => row.date <= negative.date)
    return {
      line: offender?.line ?? batchRows[0].line,
      reason: `Esta transação deixaria a posição negativa em ${negative.date}.`,
    }
  }

  return null
}
