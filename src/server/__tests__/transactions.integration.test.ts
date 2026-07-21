import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, seedCoin, seedFixture } from './testDb.ts'
import { seedAuthedSession } from './testAuth.ts'
import app from '../index.ts'

// Re-seeded in every describe block's beforeEach (after resetTestDb(),
// which clears the sessions table) — every /api request below carries
// this real signed cookie so authMiddleware runs for real (never
// bypassed/disabled in tests).
let cookieHeader = ''

async function postBuy(body: Record<string, unknown>) {
  const res = await app.request('/api/transactions/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function postSell(body: Record<string, unknown>) {
  const res = await app.request('/api/transactions/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function getPositions() {
  const res = await app.request('/api/positions', { headers: { Cookie: cookieHeader } })
  return { status: res.status, json: await res.json() }
}

async function getTransactions() {
  const res = await app.request('/api/transactions', { headers: { Cookie: cookieHeader } })
  return { status: res.status, json: await res.json() }
}

async function getRate(from: string, date: string) {
  const res = await app.request(`/api/rate?from=${from}&date=${date}`, {
    headers: { Cookie: cookieHeader },
  })
  return { status: res.status, json: await res.json() }
}

async function patchTransaction(id: number, body: Record<string, unknown>) {
  const res = await app.request(`/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function deleteTransaction(id: number) {
  const res = await app.request(`/api/transactions/${id}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader },
  })
  return { status: res.status, json: await res.json() }
}

async function postCoin(body: Record<string, unknown>) {
  const res = await app.request('/api/coins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function postExchange(body: Record<string, unknown>) {
  const res = await app.request('/api/exchanges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

describe('POST /api/transactions/buy', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('records the worked-example buy and returns 201 with recomputed positions', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(201)
    expect(json.transaction).toMatchObject({
      date: '2026-07-01',
      type: 'buy',
      quantity: '1',
    })
    expect(json.positions).toHaveLength(1)
    expect(json.positions[0]).toMatchObject({
      coin_id: coinId,
      symbol: 'BTC',
      quantity: '1',
      custo_total: '100500',
      preco_medio: '100500',
    })
  })

  it('rejects a buy with missing required fields (400, safe message)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      // quantity missing
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
    expect(json.stack).toBeUndefined()
  })

  it('rejects a buy with quantity 0 (400)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '0',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('rejects a buy dated in the future (400)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2099-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('rejects a buy referencing a non-existent coin (400, no internal state leaked)', async () => {
    const { exchangeId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: 999999,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
    expect(json.stack).toBeUndefined()
  })

  it('accepts a buy with no exchange_id at all — exchange is optional', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      // exchange_id omitted entirely
    })

    expect(status).toBe(201)
    expect(json.transaction.exchangeId).toBeNull()
  })

  it('accepts a buy with exchange_id explicitly null', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: null,
    })

    expect(status).toBe(201)
    expect(json.transaction.exchangeId).toBeNull()
  })

  it('rejects a buy with a negative value_brl or fee_brl (WR-02)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const negativeValue = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '-100',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    expect(negativeValue.status).toBe(400)

    const negativeFee = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '-1',
      exchange_id: exchangeId,
    })
    expect(negativeFee.status).toBe(400)
  })

  it('still rejects a buy referencing a non-existent exchange_id (400)', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: 999999,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('GET /api/positions', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('matches calculatePositions() over the current ledger (never a cached/derived value)', async () => {
    const { coinId, exchangeId } = seedFixture()

    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '60000',
      fee_brl: '300',
      exchange_id: exchangeId,
    })

    const { status, json } = await getPositions()

    expect(status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0]).toMatchObject({
      quantity: '1.5',
      custo_total: '160800',
      preco_medio: '107200',
    })
  })
})

describe('GET /api/transactions', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('returns rows sorted chronologically (date asc, created_at asc) and includes the exchange name', async () => {
    const { coinId, exchangeId } = seedFixture()

    // Insert out of chronological order to prove the endpoint sorts.
    await postBuy({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '60000',
      fee_brl: '300',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    const { status, json } = await getTransactions()

    expect(status).toBe(200)
    expect(json).toHaveLength(2)
    expect(json[0].date).toBe('2026-07-01')
    expect(json[1].date).toBe('2026-07-02')
    expect(json[0].exchange_name).toBe('Manual')
    expect(json[0].coin_symbol).toBe('BTC')
  })

  it('returns a transaction with no exchange (exchange_name null) instead of dropping it (LEFT JOIN)', async () => {
    const { coinId } = seedFixture()

    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      // no exchange_id
    })

    const { status, json } = await getTransactions()

    expect(status).toBe(200)
    expect(json).toHaveLength(1)
    expect(json[0].exchange_id).toBeNull()
    expect(json[0].exchange_name).toBeNull()
  })
})

describe('POST /api/transactions/sell', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('reduces quantity and custo proportionally, preco medio unchanged (POS-03)', async () => {
    const { coinId, exchangeId } = seedFixture()

    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '60000',
      fee_brl: '300',
      exchange_id: exchangeId,
    })

    const { status, json } = await postSell({
      date: '2026-07-03',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    expect(status).toBe(201)
    expect(json.positions[0]).toMatchObject({
      quantity: '1',
      custo_total: '107200',
      preco_medio: '107200',
    })
  })

  it('rejects a simple oversell with 400', async () => {
    const { coinId, exchangeId } = seedFixture()

    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    const { status, json } = await postSell({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '2',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('rejects an out-of-order (chronological) oversell even when net total is non-negative (D-07/D-08)', async () => {
    const { coinId, exchangeId } = seedFixture()

    // Buy dated AFTER an existing sell — inserting a second sell on that
    // earlier date must be rejected by chronological replay even though
    // the final net total would be non-negative.
    await postBuy({
      date: '2026-07-10',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await postSell({
      date: '2026-07-05',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('GET /api/rate', () => {
  beforeEach(async () => {
    resetTestDb()
    seedCoin('USDT', 'Tether', 'tether')
    ;({ cookieHeader } = await seedAuthedSession())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns {rate, source} and degrades to unavailable/null without throwing when CoinGecko is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network unreachable')),
    )

    const { status, json } = await getRate('USDT', '2026-07-01')

    expect(status).toBe(200)
    expect(json.source).toBe('unavailable')
    expect(json.rate).toBeNull()
  })

  it('falls back to the current rate when the historical lookup fails', async () => {
    const fetchMock = vi
      .fn()
      // historical call fails
      .mockResolvedValueOnce({ ok: false } as Response)
      // current call succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tether: { brl: 5.42 } }),
      } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const { status, json } = await getRate('USDT', '2026-07-01')

    expect(status).toBe(200)
    expect(json.source).toBe('current')
    expect(json.rate).toBe(5.42)
  })

  it('never 500s for an unknown symbol — degrades to unavailable', async () => {
    const { status, json } = await getRate('DOESNOTEXIST', '2026-07-01')

    expect(status).toBe(200)
    expect(json.source).toBe('unavailable')
    expect(json.rate).toBeNull()
  })
})

describe('PATCH /api/transactions/:id and DELETE /api/transactions/:id', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('edits a buy quantity and recomputes positions from the full ledger (TX-04, D-12)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { json: buyResult } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    const txId = buyResult.transaction.id

    const { status, json } = await patchTransaction(txId, {
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '2',
      value_brl: '200000',
      fee_brl: '1000',
      exchange_id: exchangeId,
    })

    expect(status).toBe(200)
    expect(json.positions[0]).toMatchObject({
      quantity: '2',
      custo_total: '201000',
      preco_medio: '100500',
    })
  })

  it('deletes the Wave-2 sell and the position reverts to the pre-sell state (TX-05, D-12)', async () => {
    const { coinId, exchangeId } = seedFixture()

    await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '60000',
      fee_brl: '300',
      exchange_id: exchangeId,
    })
    const { json: sellResult } = await postSell({
      date: '2026-07-03',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    const sellId = sellResult.transaction.id

    // Sanity: sell applied.
    expect(sellResult.positions[0]).toMatchObject({ quantity: '1' })

    const { status, json } = await deleteTransaction(sellId)

    expect(status).toBe(200)
    expect(json.positions[0]).toMatchObject({
      quantity: '1.5',
      custo_total: '160800',
      preco_medio: '107200',
    })
  })

  it("deleting a coin's only transaction makes its position row disappear (TX-05)", async () => {
    const { coinId, exchangeId } = seedFixture()

    const { json: buyResult } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    const { status, json } = await deleteTransaction(buyResult.transaction.id)

    expect(status).toBe(200)
    expect(json.positions).toEqual([])
  })

  it('PATCH returns 404 for a non-existent transaction', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { status } = await patchTransaction(999999, {
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    expect(status).toBe(404)
  })

  it('DELETE returns 404 for a non-existent transaction', async () => {
    const { status } = await deleteTransaction(999999)
    expect(status).toBe(404)
  })

  it('rejects editing a BUY down in quantity when a dependent SELL would go negative (CR-01, D-07/D-08)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { json: buyResult } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    const buyId = buyResult.transaction.id

    // Valid at the time: buy 1, sell 1 never goes negative.
    const { json: sellResult } = await postSell({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '1',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    expect(sellResult.positions[0]).toMatchObject({ quantity: '0' })

    // Reducing the buy to 0.5 would make the 07-02 sell of 1 go negative.
    const { status, json } = await patchTransaction(buyId, {
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '50000',
      fee_brl: '250',
      exchange_id: exchangeId,
    })

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()

    // Ledger must be unchanged — the buy is still 1, not 0.5.
    const { json: positions } = await getPositions()
    expect(positions[0]).toMatchObject({ quantity: '0' })
  })

  it('allows editing a BUY down when no dependent SELL is affected', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { json: buyResult } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    const buyId = buyResult.transaction.id

    const { status, json } = await patchTransaction(buyId, {
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '0.5',
      value_brl: '50000',
      fee_brl: '250',
      exchange_id: exchangeId,
    })

    expect(status).toBe(200)
    expect(json.positions[0]).toMatchObject({ quantity: '0.5' })
  })

  it('rejects deleting a BUY that a dependent SELL relies on (CR-02, D-07/D-08)', async () => {
    const { coinId, exchangeId } = seedFixture()

    const { json: buyResult } = await postBuy({
      date: '2026-07-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })
    const buyId = buyResult.transaction.id

    const { json: sellResult } = await postSell({
      date: '2026-07-02',
      coin_id: coinId,
      quantity: '1',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    expect(sellResult.positions[0]).toMatchObject({ quantity: '0' })

    const { status, json } = await deleteTransaction(buyId)

    expect(status).toBe(400)
    expect(json.error).toBeTruthy()

    // The buy must still exist — ledger unchanged.
    const { json: transactionsAfter } = await getTransactions()
    expect(transactionsAfter).toHaveLength(2)
  })
})

describe('POST /api/coins and POST /api/exchanges', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('adds a user coin and rejects a duplicate symbol with 400 (D-02)', async () => {
    const first = await postCoin({ symbol: 'ada', name: 'Cardano', coingecko_id: 'cardano' })
    expect(first.status).toBe(201)
    expect(first.json).toMatchObject({ symbol: 'ADA', coingecko_id: 'cardano' })

    const duplicate = await postCoin({
      symbol: 'ADA',
      name: 'Cardano (dup)',
      coingecko_id: 'cardano',
    })
    expect(duplicate.status).toBe(400)
    expect(duplicate.json.error).toBeTruthy()
  })

  it('adds a user exchange and rejects a duplicate name with 400 (D-11)', async () => {
    const first = await postExchange({ name: 'OKX' })
    expect(first.status).toBe(201)
    expect(first.json).toMatchObject({ name: 'OKX' })

    const duplicate = await postExchange({ name: 'OKX' })
    expect(duplicate.status).toBe(400)
    expect(duplicate.json.error).toBeTruthy()
  })
})
