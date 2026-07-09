import { toDecimal, ZERO } from '../lib/decimal.ts'
import type { Position, Transaction } from './types.ts'

function sortChronological(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  // Tie-break: created_at ascending (insertion order on the same date).
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return 0
}

/**
 * calculatePositions replays the full transaction ledger and returns the
 * derived {quantity, preco_medio, custo_total} per coin. PURE function: no
 * I/O, no side effects, same input always yields the same output. Derived
 * values are NEVER persisted — callers recompute this on every read
 * (POS-01).
 *
 * @param txs full transaction ledger (any coin, any order)
 * @param asOf ISO date (YYYY-MM-DD) cutoff, inclusive. Defaults to "now"
 *   so callers get today's positions with no arguments; pass an explicit
 *   date for point-in-time snapshots (e.g. Bens e Direitos as of Dec 31).
 */
export function calculatePositions(
  txs: Transaction[],
  asOf: string = new Date().toISOString().slice(0, 10),
): Position[] {
  const filtered = txs.filter((tx) => tx.date <= asOf)
  const sorted = [...filtered].sort(sortChronological)

  const positions = new Map<string | number, Position>()

  for (const tx of sorted) {
    const existing = positions.get(tx.coinId) ?? {
      coinId: tx.coinId,
      quantity: ZERO,
      precoMedio: ZERO,
      custoTotal: ZERO,
    }

    const qty = toDecimal(tx.quantity)

    if (tx.type === 'buy') {
      // custo_total += value_brl + fee_brl (fee is summed into custo, never
      // dropped, never treated as literal 0 — TX-06).
      const value = toDecimal(tx.valueBrl)
      const fee = toDecimal(tx.feeBrl)
      const newQuantity = existing.quantity.plus(qty)
      const newCustoTotal = existing.custoTotal.plus(value).plus(fee)
      const newPrecoMedio = newQuantity.gt(0)
        ? newCustoTotal.div(newQuantity)
        : ZERO

      positions.set(tx.coinId, {
        coinId: tx.coinId,
        quantity: newQuantity,
        custoTotal: newCustoTotal,
        precoMedio: newPrecoMedio,
      })
    } else {
      // SELL (Brazilian rule, POS-03): capture preco_medio from the
      // PRE-SELL state BEFORE reducing quantity. Reducing quantity first
      // would inflate preco_medio and corrupt custo_total — ordering
      // matters. Unit preco_medio stays EXACTLY unchanged after a sell.
      const precoMedioPreSell = existing.precoMedio
      const newQuantity = existing.quantity.minus(qty)
      const newCustoTotal = precoMedioPreSell.times(newQuantity)

      positions.set(tx.coinId, {
        coinId: tx.coinId,
        quantity: newQuantity,
        custoTotal: newCustoTotal,
        precoMedio: precoMedioPreSell,
      })
      // sell's value_brl (valor recebido) is inert for Phase 1 math.
    }
  }

  return Array.from(positions.values())
}
