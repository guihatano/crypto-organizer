import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, seedFixture } from './testDb.ts'
import app from '../index.ts'

async function postBuy(body: Record<string, unknown>) {
  const res = await app.request('/api/transactions/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function getPositions() {
  const res = await app.request('/api/positions')
  return { status: res.status, json: await res.json() }
}

async function getTransactions() {
  const res = await app.request('/api/transactions')
  return { status: res.status, json: await res.json() }
}

describe('POST /api/transactions/buy', () => {
  beforeEach(() => {
    resetTestDb()
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
})

describe('GET /api/positions', () => {
  beforeEach(() => {
    resetTestDb()
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
  beforeEach(() => {
    resetTestDb()
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
})
