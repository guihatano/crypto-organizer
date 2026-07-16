import { toDecimal, ZERO } from '../lib/decimal.ts'
import type { Decimal } from '../lib/decimal.ts'
import type { Position, Transaction } from './types.ts'

/**
 * One Bens e Direitos Discriminação line: a single (coin, exchange) pair
 * as of the report's as-of cutoff (D-05). `custoDeAquisicao` is a SHARE of
 * the coin-level `custoTotal` (allocation, never a re-averaged value —
 * RESEARCH Anti-Pattern A1).
 */
export interface ExchangeLine {
  coinId: string | number
  exchangeId: string | number | null // null = "exchange não informada" (D-06)
  quantity: Decimal
  custoDeAquisicao: Decimal
}

interface Group {
  coinId: string | number
  exchangeId: string | number | null
  net: Decimal
}

/**
 * Ascending exchangeId, with the null-exchange group sorted last —
 * deterministic per-coin line ordering (D-06).
 */
function compareExchangeId(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * allocateByExchange derives one Discriminação line per (coin, exchange)
 * pair from an already-cutoff-filtered ledger, allocating each line's
 * custo de aquisição as a pro-rata SHARE of the single canonical
 * coin-level `precoMedio`/`custoTotal` (never a per-exchange average —
 * re-running the averaging engine scoped to one exchange can legitimately
 * go negative, since sell validation in this codebase is coin-scoped, not
 * exchange-scoped). PURE function: no I/O, no Date usage — the cutoff is
 * the caller's responsibility (Pitfall 4), never re-applied here.
 *
 * Allocation, not re-averaging (design_decisions #1): pro-rata over the
 * positive nets, scaled to the coin's canonical quantity, with the LAST
 * group absorbing the remainder. On a clean ledger (no cross-exchange
 * sell) this degenerates to exactly `precoMedio × net` per exchange — the
 * remainder-on-last-group rule is what keeps the reconciliation invariant
 * EXACT (not approximate) when totalPositiveNet differs from
 * position.quantity, or when the pro-rata share is a repeating decimal.
 *
 * @param txsAsOfCutoff full ledger already filtered to the as-of cutoff
 *   (caller's responsibility — this function does not filter by date)
 * @param coinPositions coin-level positions from the position-replay
 *   engine, keyed by coinId — the single source of truth for
 *   precoMedio/custoTotal; this function receives them as an argument and
 *   never computes positions itself
 */
export function allocateByExchange(
  txsAsOfCutoff: Transaction[],
  coinPositions: Map<string | number, Position>,
): ExchangeLine[] {
  const groups = new Map<string, Group>()

  for (const tx of txsAsOfCutoff) {
    const exchangeId = tx.exchangeId ?? null
    const key = `${tx.coinId}:${exchangeId ?? 'none'}`
    const existing = groups.get(key) ?? { coinId: tx.coinId, exchangeId, net: ZERO }
    const qty = toDecimal(tx.quantity)
    existing.net = tx.type === 'buy' ? existing.net.plus(qty) : existing.net.minus(qty)
    groups.set(key, existing)
  }

  // Bucket only the positive-net groups (a net-negative/zero group holds
  // nothing as of the cutoff — no line to report) per coin.
  const groupsByCoin = new Map<string | number, Group[]>()
  for (const group of groups.values()) {
    if (!group.net.gt(0)) continue
    const list = groupsByCoin.get(group.coinId) ?? []
    list.push(group)
    groupsByCoin.set(group.coinId, list)
  }

  const lines: ExchangeLine[] = []

  for (const [coinId, coinGroups] of groupsByCoin) {
    const position = coinPositions.get(coinId)
    // Nothing currently held (fully sold before the cutoff, IR-01) or no
    // position tracked at all — omit the coin from the report entirely.
    if (!position || !position.quantity.gt(0)) continue

    const totalPositiveNet = coinGroups.reduce((acc, g) => acc.plus(g.net), ZERO)
    if (!totalPositiveNet.gt(0)) continue

    const sorted = [...coinGroups].sort((a, b) => compareExchangeId(a.exchangeId, b.exchangeId))

    let allocatedQuantity = ZERO
    let allocatedCusto = ZERO

    sorted.forEach((group, index) => {
      const isLast = index === sorted.length - 1
      let quantity: Decimal
      let custoDeAquisicao: Decimal

      if (isLast) {
        // Remainder rule — makes the sum exact even when the pro-rata
        // share is a repeating decimal or totalPositiveNet !=
        // position.quantity (cross-exchange sell).
        quantity = position.quantity.minus(allocatedQuantity)
        custoDeAquisicao = position.custoTotal.minus(allocatedCusto)
      } else {
        quantity = group.net.div(totalPositiveNet).times(position.quantity)
        custoDeAquisicao = position.precoMedio.times(quantity)
      }

      allocatedQuantity = allocatedQuantity.plus(quantity)
      allocatedCusto = allocatedCusto.plus(custoDeAquisicao)

      lines.push({
        coinId: group.coinId,
        exchangeId: group.exchangeId,
        quantity,
        custoDeAquisicao,
      })
    })
  }

  return lines
}
