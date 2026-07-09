import { toDecimal, ZERO } from '../lib/decimal.ts'
import type { CandidateSell, SellValidationResult, Transaction } from './types.ts'

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
