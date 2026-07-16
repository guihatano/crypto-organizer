import { Hono } from 'hono'
import { db } from '../../db/client.ts'
import { coins, transactions } from '../../db/schema.ts'
import { calculatePositions } from '../../engine/positionEngine.ts'
import type { Transaction as EngineTransaction } from '../../engine/types.ts'

/**
 * Loads the full ledger and returns it in the shape the pure engine
 * expects. Shared by GET /api/positions and by the write routes
 * (transactions.ts) so every mutation returns freshly recomputed
 * positions from the SAME code path — positions are never cached or
 * stored (POS-01).
 */
export function loadLedger(): EngineTransaction[] {
  return db
    .select()
    .from(transactions)
    .all()
    .map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      coinId: row.coinId,
      quantity: row.quantity,
      valueBrl: row.valueBrl,
      feeBrl: row.feeBrl,
      createdAt: row.createdAt,
      // Inert for calculatePositions() (only reads fields it already
      // used) — read by the Phase 3 IR allocator to group by exchange.
      exchangeId: row.exchangeId,
    }))
}

export interface SerializedPosition {
  coin_id: number
  symbol: string | null
  name: string | null
  quantity: string
  preco_medio: string
  custo_total: string
}

export function computeSerializedPositions(asOf?: string): SerializedPosition[] {
  const positions = calculatePositions(loadLedger(), asOf)
  const coinRows = db.select().from(coins).all()
  const coinMap = new Map(coinRows.map((row) => [row.id, row]))

  return positions.map((position) => {
    const coin = coinMap.get(position.coinId as number)
    return {
      coin_id: position.coinId as number,
      symbol: coin?.symbol ?? null,
      name: coin?.name ?? null,
      quantity: position.quantity.toString(),
      preco_medio: position.precoMedio.toString(),
      custo_total: position.custoTotal.toString(),
    }
  })
}

export const positionsRoute = new Hono()

positionsRoute.get('/', (c) => {
  return c.json(computeSerializedPositions())
})
