import { describe, expect, it } from 'vitest'
import { ZERO } from '../../lib/decimal.ts'
import { allocateByExchange } from '../irReportEngine.ts'
import { calculatePositions } from '../positionEngine.ts'
import type { Position, Transaction } from '../types.ts'

function buy(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    date: '2026-07-01',
    type: 'buy',
    coinId: 1,
    quantity: '1',
    valueBrl: '0',
    feeBrl: '0',
    createdAt: '2026-07-01T10:00:00.000Z',
    exchangeId: null,
    ...overrides,
  }
}

function sell(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    date: '2026-07-01',
    type: 'sell',
    coinId: 1,
    quantity: '1',
    valueBrl: '0',
    feeBrl: '0',
    createdAt: '2026-07-01T10:00:00.000Z',
    exchangeId: null,
    ...overrides,
  }
}

function positionsMap(txs: Transaction[], asOf?: string): Map<string | number, Position> {
  const positions = calculatePositions(txs, asOf)
  return new Map(positions.map((p) => [p.coinId, p]))
}

describe('allocateByExchange', () => {
  it('ledger limpo: uma linha por exchange, custo derivado do preço médio coin-level', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: 1, quantity: '1', valueBrl: '100000', feeBrl: '500' }),
      buy({ id: 2, exchangeId: 2, quantity: '1', valueBrl: '200000', feeBrl: '1000' }),
    ]
    const positions = positionsMap(txs)
    expect(positions.get(1)?.custoTotal.toString()).toBe('301500')
    expect(positions.get(1)?.precoMedio.toString()).toBe('150750')

    const lines = allocateByExchange(txs, positions)

    expect(lines).toHaveLength(2)
    const binance = lines.find((l) => l.exchangeId === 1)
    const kraken = lines.find((l) => l.exchangeId === 2)
    expect(binance?.quantity.toString()).toBe('1')
    expect(binance?.custoDeAquisicao.toString()).toBe('150750')
    expect(kraken?.quantity.toString()).toBe('1')
    expect(kraken?.custoDeAquisicao.toString()).toBe('150750')
  })

  it('D-06: transação sem exchange vira sua própria linha com exchangeId null', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: null, quantity: '1', valueBrl: '100000', feeBrl: '500' }),
    ]
    const positions = positionsMap(txs)
    const lines = allocateByExchange(txs, positions)

    expect(lines).toHaveLength(1)
    expect(lines[0].exchangeId).toBeNull()
    expect(lines[0].quantity.toString()).toBe('1')
    expect(lines[0].custoDeAquisicao.toString()).toBe('100500')
  })

  it('venda cruzada: exchange com net negativo não gera linha, a sobrevivente carrega todo o custo da moeda', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: 1, quantity: '2', valueBrl: '200000', feeBrl: '0' }),
      sell({ id: 2, exchangeId: 2, quantity: '1', valueBrl: '0', feeBrl: '0' }),
    ]
    const positions = positionsMap(txs)
    expect(positions.get(1)?.quantity.toString()).toBe('1')

    const lines = allocateByExchange(txs, positions)

    expect(lines).toHaveLength(1)
    expect(lines[0].exchangeId).toBe(1)
    expect(lines[0].quantity.toString()).toBe('1')
    expect(lines[0].custoDeAquisicao.toString()).toBe(positions.get(1)!.custoTotal.toString())
  })

  it('invariante de reconciliação: soma de quantity e custoDeAquisicao das linhas bate exatamente com a posição, para toda moeda', () => {
    const txs: Transaction[] = [
      buy({ id: 1, coinId: 1, exchangeId: 1, quantity: '2', valueBrl: '200000', feeBrl: '0' }),
      sell({ id: 2, coinId: 1, exchangeId: 2, quantity: '1', valueBrl: '0', feeBrl: '0' }),
      buy({ id: 3, coinId: 2, exchangeId: 1, quantity: '1', valueBrl: '50000', feeBrl: '0' }),
      buy({ id: 4, coinId: 2, exchangeId: null, quantity: '1', valueBrl: '70000', feeBrl: '0' }),
    ]
    const positions = positionsMap(txs)
    const lines = allocateByExchange(txs, positions)

    for (const position of positions.values()) {
      const coinLines = lines.filter((l) => l.coinId === position.coinId)
      const sumQuantity = coinLines.reduce((acc, l) => acc.plus(l.quantity), ZERO)
      const sumCusto = coinLines.reduce((acc, l) => acc.plus(l.custoDeAquisicao), ZERO)
      expect(sumQuantity.toString()).toBe(position.quantity.toString())
      expect(sumCusto.toString()).toBe(position.custoTotal.toString())
    }
  })

  it('dust/arredondamento: 3 exchanges com net positivo dividem exatamente a posição mesmo com dízima', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: 1, quantity: '1', valueBrl: '10', feeBrl: '0' }),
      buy({ id: 2, exchangeId: 2, quantity: '1', valueBrl: '10', feeBrl: '0' }),
      buy({ id: 3, exchangeId: 3, quantity: '1', valueBrl: '10', feeBrl: '0' }),
      sell({ id: 4, exchangeId: 4, quantity: '1', valueBrl: '0', feeBrl: '0' }),
    ]
    const positions = positionsMap(txs)
    expect(positions.get(1)?.quantity.toString()).toBe('2')
    expect(positions.get(1)?.custoTotal.toString()).toBe('20')

    const lines = allocateByExchange(txs, positions)

    // exchange 4's group has negative net (sell only) — excluded entirely.
    expect(lines).toHaveLength(3)
    const sumQuantity = lines.reduce((acc, l) => acc.plus(l.quantity), ZERO)
    const sumCusto = lines.reduce((acc, l) => acc.plus(l.custoDeAquisicao), ZERO)
    expect(sumQuantity.toString()).toBe('2')
    expect(sumCusto.toString()).toBe('20')
  })

  it('moeda zerada: quantity 0 na posição não gera nenhuma linha', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: 1, quantity: '1', valueBrl: '100000', feeBrl: '0' }),
      sell({ id: 2, exchangeId: 1, quantity: '1', valueBrl: '0', feeBrl: '0' }),
    ]
    const positions = positionsMap(txs)
    expect(positions.get(1)?.quantity.toString()).toBe('0')

    const lines = allocateByExchange(txs, positions)

    expect(lines).toHaveLength(0)
  })

  it('ordenação determinística: exchangeId ascendente, linha sem exchange (null) por último', () => {
    const txs: Transaction[] = [
      buy({ id: 1, exchangeId: 3, quantity: '1', valueBrl: '10', feeBrl: '0' }),
      buy({ id: 2, exchangeId: null, quantity: '1', valueBrl: '10', feeBrl: '0' }),
      buy({ id: 3, exchangeId: 1, quantity: '1', valueBrl: '10', feeBrl: '0' }),
    ]
    const positions = positionsMap(txs)
    const lines = allocateByExchange(txs, positions)

    expect(lines.map((l) => l.exchangeId)).toEqual([1, 3, null])
  })
})
