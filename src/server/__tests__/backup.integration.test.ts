import { beforeEach, describe, expect, it } from 'vitest'
import { sqlite } from '../../db/client.ts'
import { resetTestDb, seedExchange, seedFixture, seedTransaction } from './testDb.ts'
import { seedAuthedSession } from './testAuth.ts'
import app from '../index.ts'

const EXPORT_HEADER = 'data;tipo;moeda;quantidade;valor_brl;taxa_brl;exchange;origem'

let cookieHeader = ''

async function getExportCsv(headers: Record<string, string> = { Cookie: cookieHeader }) {
  const res = await app.request('/api/backup/export.csv', { headers })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

/**
 * Uploads `csvText` as a multipart/form-data 'file' field — mirrors the
 * frontend's raw fetch+FormData mechanics (NOT apiClient, which hardcodes
 * application/json and would break the multipart boundary).
 */
async function postImport(csvText: string, headers: Record<string, string> = { Cookie: cookieHeader }) {
  const formData = new FormData()
  formData.append('file', new File([csvText], 'backup.csv', { type: 'text/csv' }))
  const res = await app.request('/api/backup/import', { method: 'POST', body: formData, headers })
  const body = (await res.json().catch(() => null)) as unknown
  return { status: res.status, body }
}

function countTransactions(): number {
  const row = sqlite.prepare('SELECT COUNT(*) as count FROM transactions').get() as {
    count: number
  }
  return row.count
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

describe('POST /api/backup/import', () => {
  beforeEach(async () => {
    resetTestDb()
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader
  })

  it('returns 401 without a session cookie (AUTH-05)', async () => {
    const { status } = await postImport(`${EXPORT_HEADER}\n`, {})
    expect(status).toBe(401)
  })

  it('round-trip: reimporting a just-exported file adds zero rows (BACKUP-02/03)', async () => {
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
    insertTransaction({
      date: '2026-01-03',
      type: 'buy',
      coinId,
      quantity: '0.01',
      valueBrl: '100.00',
      feeBrl: '0',
      exchangeId: null,
    })

    const { text: exportedCsv } = await getExportCsv()
    const countBefore = countTransactions()

    const { status, body } = await postImport(exportedCsv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 0, duplicates_skipped: 3, new_exchanges: [] })
    expect(countTransactions()).toBe(countBefore)
  })

  it('atomic rollback: a batch with one unknown-coin row writes nothing (BACKUP-04)', async () => {
    seedFixture() // seeds BTC + Manual, referenced by the CSV rows below

    const csvLines = [
      EXPORT_HEADER,
      '2026-01-01;compra;BTC;1;1000.00;0;Manual;manual',
      '2026-01-02;compra;BTC;1;1000.00;0;Manual;manual',
      '2026-01-03;compra;BTC;1;1000.00;0;Manual;manual',
      '2026-01-04;compra;BTC;1;1000.00;0;Manual;manual',
      '2026-01-05;compra;BTC;1;1000.00;0;Manual;manual',
      '2026-01-06;compra;XPTO;1;1000.00;0;Manual;manual', // unknown coin
    ]

    const countBefore = countTransactions()
    const { status, body } = await postImport(csvLines.join('\n') + '\n')

    expect(status).toBe(400)
    expect(body).toMatchObject({
      errors: [{ line: 7, reason: expect.stringContaining('XPTO') }],
    })
    expect(countTransactions()).toBe(countBefore)
  })

  it('precision round-trip: odd-precision decimals survive export -> fresh DB -> import byte-identical (BACKUP-02)', async () => {
    const { coinId, exchangeId } = seedFixture()
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '0.00314159',
      valueBrl: '1500.00',
      feeBrl: '0',
      exchangeId,
    })

    const { text: exportedCsv } = await getExportCsv()

    // "Fresh DB": reset everything, then reseed the coin/exchange (mirrors
    // an app-level seed list surviving a wiped ledger) and a fresh session.
    resetTestDb()
    const { coinId: freshCoinId } = seedFixture()
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader

    const { status, body } = await postImport(exportedCsv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 1, duplicates_skipped: 0, new_exchanges: [] })

    const row = sqlite
      .prepare('SELECT quantity, value_brl, fee_brl FROM transactions WHERE coin_id = ?')
      .get(freshCoinId) as { quantity: string; value_brl: string; fee_brl: string }
    expect(row).toEqual({ quantity: '0.00314159', value_brl: '1500.00', fee_brl: '0' })
  })

  it('dedupes a row equal to an existing tx but formatted differently, "1500.00" vs "1500" (Pitfall 4)', async () => {
    const { coinId, exchangeId } = seedFixture()
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '1500',
      feeBrl: '0',
      exchangeId,
    })

    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;1500.00;0;Manual;manual\n`
    const countBefore = countTransactions()
    const { status, body } = await postImport(csv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 0, duplicates_skipped: 1, new_exchanges: [] })
    expect(countTransactions()).toBe(countBefore)
  })

  it('dedupes a no-exchange row only against another no-exchange row (D-09)', async () => {
    const { coinId, exchangeId } = seedFixture()
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100',
      feeBrl: '0',
      exchangeId: null,
    })
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100',
      feeBrl: '0',
      exchangeId,
    })

    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;100;0;;manual\n`
    const { status, body } = await postImport(csv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 0, duplicates_skipped: 1, new_exchanges: [] })
  })

  it('shuffle-order invariance: reordering CSV rows yields identical import counts (BACKUP-02)', async () => {
    const rowsInOrder = [
      '2026-01-01;compra;BTC;5;1000.00;0;;manual',
      '2026-01-02;venda;BTC;2;500.00;0;;manual',
      '2026-01-03;compra;BTC;1;200.00;0;;manual',
    ]
    const shuffled = [rowsInOrder[2], rowsInOrder[0], rowsInOrder[1]]
    const csvOrdered = [EXPORT_HEADER, ...rowsInOrder].join('\n') + '\n'
    const csvShuffled = [EXPORT_HEADER, ...shuffled].join('\n') + '\n'

    seedFixture()
    const { status: status1, body: body1 } = await postImport(csvOrdered)
    expect(status1).toBe(200)

    resetTestDb()
    seedFixture()
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader

    const { status: status2, body: body2 } = await postImport(csvShuffled)
    expect(status2).toBe(200)
    expect(body2).toEqual(body1)
  })

  it('rejects the whole batch when it would drive the position negative (BACKUP-04, T-06-06)', async () => {
    const { coinId, exchangeId } = seedFixture()
    seedTransaction({
      date: '2026-01-10',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '1000',
      feeBrl: '0',
      exchangeId,
    })

    const csv = `${EXPORT_HEADER}\n2026-01-05;venda;BTC;2;1000.00;0;Manual;manual\n`
    const countBefore = countTransactions()
    const { status, body } = await postImport(csv)

    expect(status).toBe(400)
    expect(body).toMatchObject({
      errors: [{ line: 2, reason: expect.stringContaining('negativa') }],
    })
    expect(countTransactions()).toBe(countBefore)
  })

  it('auto-creates an unknown exchange and reports it in new_exchanges (D-01/D-02)', async () => {
    seedFixture()
    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;100.00;0;NomeNovo;manual\n`

    const { status, body } = await postImport(csv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 1, duplicates_skipped: 0, new_exchanges: ['NomeNovo'] })

    const exchangeRow = sqlite.prepare('SELECT id FROM exchanges WHERE name = ?').get('NomeNovo')
    expect(exchangeRow).toBeTruthy()
  })

  it('rejects an unknown coin symbol without auto-creating it (D-01)', async () => {
    seedFixture()
    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;XPTO;1;100.00;0;Manual;manual\n`

    const { status, body } = await postImport(csv)

    expect(status).toBe(400)
    expect(body).toMatchObject({ errors: [{ line: 2, reason: expect.stringContaining('XPTO') }] })

    const coinRow = sqlite.prepare('SELECT id FROM coins WHERE symbol = ?').get('XPTO')
    expect(coinRow).toBeUndefined()
    expect(countTransactions()).toBe(0)
  })

  it('forces origin to csv-import regardless of the CSV origem cell (BACKUP-05)', async () => {
    seedFixture()
    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;100.00;0;Manual;manual\n`

    const { status } = await postImport(csv)
    expect(status).toBe(200)

    const row = sqlite.prepare('SELECT origin FROM transactions LIMIT 1').get() as {
      origin: string
    }
    expect(row.origin).toBe('csv-import')
  })

  it('returns a single malformed-file message with no per-row list on unparseable CSV (T-06-04)', async () => {
    seedFixture()
    // Ragged row (only 6 of 8 columns) with relax_column_count:false -> throws.
    const malformed = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;100.00;0\n`

    const { status, body } = await postImport(malformed)

    expect(status).toBe(400)
    expect(body).toMatchObject({ error: expect.any(String) })
    expect((body as { errors?: unknown }).errors).toBeUndefined()
    expect(countTransactions()).toBe(0)
  })

  it('returns imported:0 duplicates:0 and writes nothing for a header-only CSV', async () => {
    seedFixture()
    const { status, body } = await postImport(`${EXPORT_HEADER}\n`)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 0, duplicates_skipped: 0, new_exchanges: [] })
    expect(countTransactions()).toBe(0)
  })

  it('round-trips a formula-escaped exchange name with no leftover apostrophe (Pitfall 1)', async () => {
    const { coinId } = seedFixture()
    const suspiciousExchangeId = seedExchange('-Test')
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100.00',
      feeBrl: '0',
      exchangeId: suspiciousExchangeId,
    })

    const { text: exportedCsv } = await getExportCsv()
    expect(exportedCsv).toContain("'-Test")

    resetTestDb()
    seedFixture() // recreates BTC so 'moeda' resolves; the '-Test exchange does not exist yet
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader

    const { status, body } = await postImport(exportedCsv)

    expect(status).toBe(200)
    expect(body).toMatchObject({ new_exchanges: ['-Test'] })

    const recreated = sqlite.prepare('SELECT name FROM exchanges WHERE name = ?').get('-Test')
    expect(recreated).toEqual({ name: '-Test' })
    const leftoverApostrophe = sqlite
      .prepare('SELECT name FROM exchanges WHERE name = ?')
      .get("'-Test")
    expect(leftoverApostrophe).toBeUndefined()
  })

  it('does NOT dedupe a brand-new-exchange row against an existing no-exchange row (CR-01a)', async () => {
    const { coinId } = seedFixture()
    // Existing no-exchange tx matching every non-exchange field of the CSV row.
    insertTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100',
      feeBrl: '0',
      exchangeId: null,
    })

    // Row names a not-yet-existing exchange: exchangeId is null at dedupe
    // time, but it is NOT the same as the no-exchange row above.
    const csv = `${EXPORT_HEADER}\n2026-01-01;compra;BTC;1;100;0;NomeNovo;manual\n`
    const countBefore = countTransactions()
    const { status, body } = await postImport(csv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 1, duplicates_skipped: 0, new_exchanges: ['NomeNovo'] })
    expect(countTransactions()).toBe(countBefore + 1)
    expect(sqlite.prepare('SELECT id FROM exchanges WHERE name = ?').get('NomeNovo')).toBeTruthy()
  })

  it('does NOT collide two distinct brand-new exchanges in the same batch (CR-01b)', async () => {
    seedFixture()
    // Same date/type/coin/qty/value/fee/origin, differing ONLY by a new
    // exchange name — the old key folded both to "null" and dropped one.
    const csv =
      `${EXPORT_HEADER}\n` +
      '2026-01-01;compra;BTC;1;100;0;ExchangeA;manual\n' +
      '2026-01-01;compra;BTC;1;100;0;ExchangeB;manual\n'

    const { status, body } = await postImport(csv)

    expect(status).toBe(200)
    expect(body).toEqual({ imported: 2, duplicates_skipped: 0, new_exchanges: ['ExchangeA', 'ExchangeB'] })
    expect(sqlite.prepare('SELECT id FROM exchanges WHERE name = ?').get('ExchangeA')).toBeTruthy()
    expect(sqlite.prepare('SELECT id FROM exchanges WHERE name = ?').get('ExchangeB')).toBeTruthy()
  })

  it('round-trips an exchange name that genuinely starts with an apostrophe (WR-01)', async () => {
    const { coinId } = seedFixture()
    // Apostrophe + a formula-trigger char: the ambiguous case the doubled-
    // apostrophe encoding exists to disambiguate.
    const realName = "'-Test"
    const genuineApostropheId = seedExchange(realName)
    seedTransaction({
      date: '2026-01-01',
      type: 'buy',
      coinId,
      quantity: '1',
      valueBrl: '100.00',
      feeBrl: '0',
      exchangeId: genuineApostropheId,
    })

    const { text: exportedCsv } = await getExportCsv()
    // Export doubles the leading apostrophe so reimport can tell it apart
    // from the OWASP single-apostrophe escape marker.
    expect(exportedCsv).toContain("''-Test")

    resetTestDb()
    seedFixture()
    const session = await seedAuthedSession()
    cookieHeader = session.cookieHeader

    const { status, body } = await postImport(exportedCsv)

    expect(status).toBe(200)
    // Recreated with the apostrophe intact — NOT stripped to "-Test".
    expect(body).toMatchObject({ new_exchanges: [realName] })
    expect(sqlite.prepare('SELECT name FROM exchanges WHERE name = ?').get(realName)).toEqual({
      name: realName,
    })
    expect(sqlite.prepare('SELECT name FROM exchanges WHERE name = ?').get('-Test')).toBeUndefined()
  })
})
