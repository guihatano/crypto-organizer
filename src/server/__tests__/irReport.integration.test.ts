import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestDb, seedExchange, seedFixture } from './testDb.ts'
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

async function getIrReport(year: number | string) {
  const res = await app.request(`/api/ir-report?year=${year}`, { headers: { Cookie: cookieHeader } })
  return { status: res.status, json: await res.json() }
}

async function getIrReportNoYear() {
  const res = await app.request('/api/ir-report', { headers: { Cookie: cookieHeader } })
  return { status: res.status, json: await res.json() }
}

async function getIrReportYears() {
  const res = await app.request('/api/ir-report/years', { headers: { Cookie: cookieHeader } })
  return { status: res.status, json: await res.json() }
}

describe('GET /api/ir-report', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('inclui transação de 2025-12-31 no relatório de 2025 e exclui uma de 2026-01-01 (corte 31/12)', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2025-12-31',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '200000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    expect(json.coins).toHaveLength(1)
    expect(json.coins[0].quantity).toBe('1')
    expect(json.coins[0].custo_total).toBe('100000')
  })

  it('meets_threshold é true quando o custo agregado cruza R$5.000 mesmo dividido entre duas exchanges (IR-02, Pitfall 2)', async () => {
    const { coinId } = seedFixture()
    const binance = seedExchange('Binance')
    const kraken = seedExchange('Kraken')
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '3000',
      fee_brl: '0',
      exchange_id: binance,
    })
    await postBuy({
      date: '2025-01-02',
      coin_id: coinId,
      quantity: '1',
      value_brl: '3000',
      fee_brl: '0',
      exchange_id: kraken,
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    expect(json.coins[0].custo_total).toBe('6000')
    expect(json.coins[0].meets_threshold).toBe(true)
  })

  it('meets_threshold é false quando o custo total da moeda fica abaixo de R$5.000', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '4999.99',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    expect(json.coins[0].meets_threshold).toBe(false)
  })

  it('cada moeda traz lines por exchange com exchange_name, cnpj, quantity, custo_de_aquisicao e discriminacao_text', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '500',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    const [line] = json.coins[0].lines
    expect(line).toMatchObject({
      exchange_id: exchangeId,
      exchange_name: 'Manual',
      cnpj: null,
      quantity: '1',
      custo_de_aquisicao: '100500',
    })
    expect(typeof line.discriminacao_text).toBe('string')
    // D-08: exchange with no CNPJ recorded still produces the text, with a
    // placeholder rather than blocking generation.
    expect(line.discriminacao_text).toContain('CNPJ: [não informado]')
  })

  it('D-06: transação sem exchange gera linha com exchange_id null e "Exchange não informada" no texto', async () => {
    const { coinId } = seedFixture()
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '0',
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    const [line] = json.coins[0].lines
    expect(line.exchange_id).toBeNull()
    expect(line.discriminacao_text).toContain('Exchange não informada')
  })

  it('omite do relatório uma moeda totalmente vendida antes do corte', async () => {
    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    await postSell({
      date: '2025-06-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '0',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReport(2025)

    expect(status).toBe(200)
    expect(json.coins).toHaveLength(0)
  })
})

describe('GET /api/ir-report validação (ASVS V12)', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  it('retorna 400 com mensagem pt-BR quando year está ausente', async () => {
    const { status, json } = await getIrReportNoYear()
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
    expect(json.stack).toBeUndefined()
  })

  it('retorna 400 quando year não é um inteiro ("abc")', async () => {
    const { status, json } = await getIrReport('abc')
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('retorna 400 quando year tem apenas 3 dígitos', async () => {
    const { status, json } = await getIrReport('203')
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('retorna 400 quando year é bem formado mas não há transações no ledger para esse ano (D-01)', async () => {
    const { status, json } = await getIrReport(2025)
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('GET /api/ir-report/years', () => {
  beforeEach(async () => {
    resetTestDb()
    ;({ cookieHeader } = await seedAuthedSession())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna anos descendentes (D-01) com default_year = último ano fechado em BRT (D-02)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))

    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2024-05-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '1000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2025-05-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '1000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })
    await postBuy({
      date: '2026-01-10',
      coin_id: coinId,
      quantity: '1',
      value_brl: '1000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReportYears()

    expect(status).toBe(200)
    expect(json.years).toEqual([2026, 2025, 2024])
    expect(json.default_year).toBe(2025)
  })

  it('nunca usa o ano corrente em andamento como default quando só existem dados de 2026 (D-02)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))

    const { coinId, exchangeId } = seedFixture()
    await postBuy({
      date: '2026-02-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '1000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const { status, json } = await getIrReportYears()

    expect(status).toBe(200)
    expect(json.years).toEqual([2026])
    expect(json.default_year).toBeNull()
  })
})
