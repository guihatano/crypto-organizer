import { beforeEach, describe, expect, it } from 'vitest'
import { sqlite } from '../../db/client.ts'
import { resetTestDb, seedExchange, seedFixture } from './testDb.ts'
import { seedAuthedSession } from './testAuth.ts'
import app from '../index.ts'

const EXPORT_HEADER = 'data;tipo;moeda;quantidade;valor_brl;taxa_brl;exchange;origem'

let cookieHeader = ''

async function getExportCsv(headers: Record<string, string> = { Cookie: cookieHeader }) {
  const res = await app.request('/api/backup/export.csv', { headers })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

/**
 * Raw-SQL transaction insert (mirroring seedFixture's prepare/run style)
 * so tests fully control the seeded TEXT columns and exchange_id, without
 * going through POST /transactions/buy|sell's chronological/ledger
 * validation (which the export route itself never touches).
 */
function insertTransaction(row: {
  date: string
  type: 'buy' | 'sell'
  coinId: number
  quantity: string
  valueBrl: string
  feeBrl: string
  exchangeId: number | null
  origin?: string
}): void {
  const now = new Date().toISOString()
  sqlite
    .prepare(
      `INSERT INTO transactions
         (date, type, coin_id, quantity, value_brl, fee_brl, exchange_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.date,
      row.type,
      row.coinId,
      row.quantity,
      row.valueBrl,
      row.feeBrl,
      row.exchangeId,
      row.origin ?? 'manual',
      now,
      now,
    )
}

describe('GET /api/backup/export.csv', () => {
  beforeEach(async () => {
    resetTestDb()
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader
  })

  it('returns 401 without a session cookie (AUTH-05)', async () => {
    const { status } = await getExportCsv({})
    expect(status).toBe(401)
  })

  it('exports every transaction as a business-key, precision-verbatim CSV', async () => {
    const { coinId, exchangeId } = seedFixture()

    insertTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '0.00314159',
      valueBrl: '1500.00',
      feeBrl: '0',
      exchangeId,
    })
    insertTransaction({
      date: '2026-01-02',
      type: 'sell',
      coinId,
      quantity: '0.001',
      valueBrl: '500.00',
      feeBrl: '5.00',
      exchangeId,
    })
    // No exchange (D-09): must export an empty exchange cell, not "null".
    insertTransaction({
      date: '2026-01-03',
      type: 'buy',
      coinId,
      quantity: '0.01',
      valueBrl: '100.00',
      feeBrl: '0',
      exchangeId: null,
    })

    const { status, headers, text } = await getExportCsv()

    expect(status).toBe(200)
    expect(headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(headers.get('content-disposition')).toMatch(
      /^attachment; filename="backup-\d{4}-\d{2}-\d{2}\.csv"$/,
    )

    const lines = text.split('\n').filter((line) => line.length > 0)
    expect(lines[0]).toBe(EXPORT_HEADER)
    // Ordered (date asc, createdAt asc); decimal cells byte-identical to
    // the seeded raw TEXT (D-04) — never re-serialized through Decimal.js.
    expect(lines[1]).toBe('2026-01-01;compra;BTC;0.00314159;1500.00;0;Manual;manual')
    expect(lines[2]).toBe('2026-01-02;venda;BTC;0.001;500.00;5.00;Manual;manual')
    expect(lines[3]).toBe('2026-01-03;compra;BTC;0.01;100.00;0;;manual')
    expect(lines).toHaveLength(4)
  })

  it('escapes a formula-injection exchange name with an apostrophe prefix (T-06-01)', async () => {
    const { coinId } = seedFixture()
    const suspiciousExchangeId = seedExchange('-Test')

    insertTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100.00',
      feeBrl: '0',
      exchangeId: suspiciousExchangeId,
    })

    const { text } = await getExportCsv()
    const lines = text.split('\n').filter((line) => line.length > 0)
    expect(lines[1]).toBe("2026-01-01;compra;BTC;1;100.00;0;'-Test;manual")
  })

  it('returns a header-line-only CSV when there are zero transactions', async () => {
    const { status, text } = await getExportCsv()
    expect(status).toBe(200)
    expect(text).toBe(`${EXPORT_HEADER}\n`)
  })
})
