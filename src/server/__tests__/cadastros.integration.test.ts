import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb, seedExchange, seedFixture } from './testDb.ts'
import app from '../index.ts'

async function postBuy(body: Record<string, unknown>) {
  const res = await app.request('/api/transactions/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function patchExchange(id: number | string, body: unknown) {
  const res = await app.request(`/api/exchanges/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function patchExchangeRawBody(id: number | string, rawBody: string) {
  const res = await app.request(`/api/exchanges/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  })
  return { status: res.status, json: await res.json() }
}

async function patchCoin(id: number | string, body: unknown) {
  const res = await app.request(`/api/coins/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

async function patchCoinRawBody(id: number | string, rawBody: string) {
  const res = await app.request(`/api/coins/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  })
  return { status: res.status, json: await res.json() }
}

async function getExchanges() {
  const res = await app.request('/api/exchanges')
  return { status: res.status, json: (await res.json()) as Array<{ id: number; cnpj?: string | null }> }
}

async function getCoins() {
  const res = await app.request('/api/coins')
  return {
    status: res.status,
    json: (await res.json()) as Array<{ id: number; grupo08_subcodigo?: string | null }>,
  }
}

async function getIrReport(year: number | string) {
  const res = await app.request(`/api/ir-report?year=${year}`)
  return { status: res.status, json: await res.json() }
}

describe('PATCH /api/exchanges/:id', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('salva um CNPJ e o reflete em GET /api/exchanges (IR-04)', async () => {
    const { exchangeId } = seedFixture()

    const { status, json } = await patchExchange(exchangeId, { cnpj: '12.345.678/0001-90' })

    expect(status).toBe(200)
    expect(json).toMatchObject({ id: exchangeId, name: 'Manual', cnpj: '12.345.678/0001-90' })

    const { json: exchanges } = await getExchanges()
    const saved = exchanges.find((e) => e.id === exchangeId)
    expect(saved?.cnpj).toBe('12.345.678/0001-90')
  })

  it('remove espaços das pontas e converte um cnpj em branco/whitespace em null (nunca string vazia)', async () => {
    const { exchangeId } = seedFixture()

    const trimmed = await patchExchange(exchangeId, { cnpj: '  12.345.678/0001-90  ' })
    expect(trimmed.json.cnpj).toBe('12.345.678/0001-90')

    const blanked = await patchExchange(exchangeId, { cnpj: '   ' })
    expect(blanked.status).toBe(200)
    expect(blanked.json.cnpj).toBeNull()
  })

  it('aceita um cnpj obviamente malformado sem rejeitar — nunca bloqueia a Discriminação (D-08)', async () => {
    const { exchangeId } = seedFixture()

    const { status, json } = await patchExchange(exchangeId, { cnpj: 'abc' })

    expect(status).toBe(200)
    expect(json.cnpj).toBe('abc')
  })

  it('retorna 400 com mensagem pt-BR quando o id não é um inteiro', async () => {
    const { status, json } = await patchExchange('abc', { cnpj: '123' })
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('retorna 404 com mensagem pt-BR quando o id não existe', async () => {
    const { status, json } = await patchExchange(999999, { cnpj: '123' })
    expect(status).toBe(404)
    expect(json.error).toBeTruthy()
  })

  it('retorna 400 quando o corpo não é JSON válido', async () => {
    const { exchangeId } = seedFixture()
    const { status, json } = await patchExchangeRawBody(exchangeId, 'isto não é json')
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('PATCH /api/coins/:id', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('salva um sub-código Grupo 08 e o reflete em GET /api/coins (D-07)', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await patchCoin(coinId, { grupo08_subcodigo: '01' })

    expect(status).toBe(200)
    expect(json).toMatchObject({ id: coinId, symbol: 'BTC', grupo08_subcodigo: '01' })

    const { json: coinsList } = await getCoins()
    const saved = coinsList.find((c) => c.id === coinId)
    expect(saved?.grupo08_subcodigo).toBe('01')
  })

  it('aceita um código arbitrário nunca visto antes — campo deliberadamente sem lista fixa (D-07)', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await patchCoin(coinId, { grupo08_subcodigo: '47' })

    expect(status).toBe(200)
    expect(json.grupo08_subcodigo).toBe('47')
  })

  it('converte um sub-código em branco em null', async () => {
    const { coinId } = seedFixture()

    const { status, json } = await patchCoin(coinId, { grupo08_subcodigo: '   ' })

    expect(status).toBe(200)
    expect(json.grupo08_subcodigo).toBeNull()
  })

  it('retorna 400 com mensagem pt-BR quando o id não é um inteiro', async () => {
    const { status, json } = await patchCoin('abc', { grupo08_subcodigo: '01' })
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })

  it('retorna 404 com mensagem pt-BR quando o id não existe', async () => {
    const { status, json } = await patchCoin(999999, { grupo08_subcodigo: '01' })
    expect(status).toBe(404)
    expect(json.error).toBeTruthy()
  })

  it('retorna 400 quando o corpo não é JSON válido', async () => {
    const { coinId } = seedFixture()
    const { status, json } = await patchCoinRawBody(coinId, 'isto não é json')
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('Reflexo do cadastro na Discriminação (fluxo ponta a ponta)', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('CNPJ e sub-código salvos aparecem em discriminacao_text; limpar o CNPJ restaura o placeholder sem nunca dar erro (IR-03/IR-04/D-07/D-08)', async () => {
    const { coinId, exchangeId } = seedFixture()
    // Pinned to a closed year (2025) so this assertion holds regardless of
    // when the suite runs — never derived from the current date.
    await postBuy({
      date: '2025-01-01',
      coin_id: coinId,
      quantity: '1',
      value_brl: '100000',
      fee_brl: '0',
      exchange_id: exchangeId,
    })

    const before = await getIrReport(2025)
    expect(before.status).toBe(200)
    const beforeLine = before.json.coins[0].lines[0]
    expect(beforeLine.discriminacao_text).toContain('CNPJ: [não informado]')
    expect(beforeLine.discriminacao_text).not.toMatch(/sub-código Grupo 08/)

    const patchedExchange = await patchExchange(exchangeId, { cnpj: '12.345.678/0001-90' })
    expect(patchedExchange.status).toBe(200)
    const patchedCoin = await patchCoin(coinId, { grupo08_subcodigo: '01' })
    expect(patchedCoin.status).toBe(200)

    const after = await getIrReport(2025)
    expect(after.status).toBe(200)
    const afterLine = after.json.coins[0].lines[0]
    expect(afterLine.discriminacao_text).toContain('12.345.678/0001-90')
    expect(afterLine.discriminacao_text).not.toContain('CNPJ: [não informado]')
    expect(afterLine.discriminacao_text).toContain('sub-código Grupo 08 01')

    const cleared = await patchExchange(exchangeId, { cnpj: '' })
    expect(cleared.status).toBe(200)

    const afterClear = await getIrReport(2025)
    expect(afterClear.status).toBe(200)
    const clearedLine = afterClear.json.coins[0].lines[0]
    expect(clearedLine.discriminacao_text).toContain('CNPJ: [não informado]')
  })
})

describe('GET /api/exchanges e GET /api/coins projetam os novos campos', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('GET /api/exchanges inclui cnpj (null antes de qualquer PATCH)', async () => {
    seedFixture()
    const { status, json } = await getExchanges()
    expect(status).toBe(200)
    expect(json[0]).toHaveProperty('cnpj')
  })

  it('GET /api/coins inclui grupo08_subcodigo (null antes de qualquer PATCH)', async () => {
    seedFixture()
    const { status, json } = await getCoins()
    expect(status).toBe(200)
    expect(json[0]).toHaveProperty('grupo08_subcodigo')
  })

  it('GET /api/exchanges/segunda exchange também aparece (regressão simples de seedExchange)', async () => {
    seedFixture()
    seedExchange('Binance')
    const { json } = await getExchanges()
    expect(json.length).toBeGreaterThanOrEqual(2)
  })
})
