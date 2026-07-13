import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, seedFixture, setCoinPriceCache } from './testDb.ts'
import { toDecimal } from '../../lib/decimal.ts'

// Stubbed BEFORE importing the app so every route that imports coingecko.ts
// (the new prices route) receives the mock instead of hitting the network.
vi.mock('../coingecko.ts', () => ({
  getBatchPrices: vi.fn(),
}))

import app from '../index.ts'
import { getBatchPrices } from '../coingecko.ts'

const getBatchPricesMock = vi.mocked(getBatchPrices)

async function postBuy(body: Record<string, unknown>) {
  const res = await app.request('/api/transactions/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function getPrices() {
  const res = await app.request('/api/prices')
  return { status: res.status, json: await res.json() }
}

describe('GET /api/prices', () => {
  beforeEach(() => {
    resetTestDb()
    getBatchPricesMock.mockReset()
  })

  it('enriches a coin with a fresh quote (BRL + USD, market value, pnl, pnl_pct, stale=false)', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    getBatchPricesMock.mockResolvedValue({
      bitcoin: { brl: 150000, usd: 30000 },
    })

    const { status, json } = await getPrices()

    expect(status).toBe(200)
    const row = json.positions.find((p: { coin_id: number }) => p.coin_id === coinId)
    expect(row).toBeDefined()
    expect(row.price_brl).toBe('150000')
    expect(row.price_usd).toBe('30000')
    expect(row.market_value_brl).toBe('150000')
    expect(row.pnl_brl).toBe('49500')
    const expectedPnlPct = toDecimal('150000').div('100500').minus(1).toString()
    expect(row.pnl_pct).toBe(expectedPnlPct)
    expect(row.stale).toBe(false)

    // USD side: fx = 150000/30000 = 5; custo_usd = 100500/5 = 20100;
    // market_value_usd = 1 * 30000 = 30000; pnl_usd = 30000 - 20100 = 9900.
    expect(row.market_value_usd).toBe('30000')
    expect(row.pnl_usd).toBe('9900')
    // pnl_pct is currency-independent (single field, identical for BRL/USD).
    expect(row.pnl_pct).toBe(expectedPnlPct)
  })

  it('returns market value but null pnl/pnl_pct for a zero-cost coin with a fresh price (no division by zero)', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    getBatchPricesMock.mockResolvedValue({
      bitcoin: { brl: 150000, usd: 30000 },
    })

    const { status, json } = await getPrices()

    expect(status).toBe(200)
    const row = json.positions.find((p: { coin_id: number }) => p.coin_id === coinId)
    expect(row).toBeDefined()
    expect(row.quantity).toBe('1')
    expect(row.preco_medio).toBe('0')
    expect(row.custo_total).toBe('0')
    expect(row.market_value_brl).toBe('150000')
    expect(row.market_value_usd).toBe('30000')
    expect(row.pnl_brl).toBeNull()
    expect(row.pnl_usd).toBeNull()
    expect(row.pnl_pct).toBeNull()
  })

  it('serves the saved cache with stale=true when no fresh quote is available', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    setCoinPriceCache(coinId, {
      lastPriceBrl: '140000',
      lastPriceUsd: '28000',
      fetchedAt: '2026-07-01T12:00:00.000Z',
    })

    getBatchPricesMock.mockResolvedValue({
      bitcoin: { brl: null, usd: null },
    })

    const { status, json } = await getPrices()

    expect(status).toBe(200)
    const row = json.positions.find((p: { coin_id: number }) => p.coin_id === coinId)
    expect(row).toBeDefined()
    expect(row.price_brl).toBe('140000')
    expect(row.price_usd).toBe('28000')
    expect(row.stale).toBe(true)
    expect(row.fetched_at).toBe('2026-07-01T12:00:00.000Z')
  })

  it('degrades to null market/pnl fields (row not omitted) when there is no fresh quote and no saved value', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    getBatchPricesMock.mockResolvedValue({
      bitcoin: { brl: null, usd: null },
    })

    const { status, json } = await getPrices()

    expect(status).toBe(200)
    const row = json.positions.find((p: { coin_id: number }) => p.coin_id === coinId)
    expect(row).toBeDefined()
    expect(row.quantity).toBe('1')
    expect(row.custo_total).toBe('100500')
    expect(row.price_brl).toBeNull()
    expect(row.price_usd).toBeNull()
    expect(row.market_value_brl).toBeNull()
    expect(row.pnl_brl).toBeNull()
    expect(row.pnl_pct).toBeNull()
    expect(row.stale).toBe(false)
    expect(json.coins_without_price).toBeGreaterThanOrEqual(1)
  })

  it('returns HTTP 200 with a partial aggregate and coins_without_price when the price provider is fully down', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    getBatchPricesMock.mockRejectedValue(new Error('network unreachable'))

    const { status, json } = await getPrices()

    expect(status).toBe(200)
    expect(json.total_invested_brl).toBe('100500')
    expect(typeof json.total_pnl_pct === 'string' || json.total_pnl_pct === null).toBe(true)
    expect(json.coins_without_price).toBeGreaterThanOrEqual(1)
  })

  it('returns total_pnl_pct as null when total_invested_brl is 0 (no coins / all zero-cost)', async () => {
    const { status, json } = await getPrices()

    expect(status).toBe(200)
    expect(json.total_invested_brl).toBe('0')
    expect(json.total_pnl_pct).toBeNull()
    expect(json.positions).toEqual([])
    expect(json.fetched_at).toBeNull()
  })
})
