import { describe, expect, it } from 'vitest'
import { calculatePositions } from '../positionEngine.ts'
import type { Transaction } from '../types.ts'

function buy(overrides: Partial<Transaction> & { id: number }): Transaction {
  return {
    date: '2026-07-01',
    type: 'buy',
    coinId: 1,
    quantity: '1',
    valueBrl: '0',
    feeBrl: '0',
    createdAt: '2026-07-01T10:00:00.000Z',
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
    ...overrides,
  }
}

describe('calculatePositions', () => {
  it('(a) worked example: 1 BTC @ R$100.000 + R$500 fee -> custo 100500, preco medio 100500', () => {
    const txs: Transaction[] = [
      buy({ id: 1, date: '2026-07-01', quantity: '1', valueBrl: '100000', feeBrl: '500' }),
    ]

    const [position] = calculatePositions(txs)

    expect(position.quantity.toString()).toBe('1')
    expect(position.custoTotal.toString()).toBe('100500')
    expect(position.precoMedio.toString()).toBe('100500')
  })

  it('(b) second buy 0,5 BTC @ R$60.000 + R$300 -> preco medio becomes 107200', () => {
    const txs: Transaction[] = [
      buy({
        id: 1,
        date: '2026-07-01',
        quantity: '1',
        valueBrl: '100000',
        feeBrl: '500',
        createdAt: '2026-07-01T10:00:00.000Z',
      }),
      buy({
        id: 2,
        date: '2026-07-02',
        quantity: '0.5',
        valueBrl: '60000',
        feeBrl: '300',
        createdAt: '2026-07-02T10:00:00.000Z',
      }),
    ]

    const [position] = calculatePositions(txs)

    expect(position.quantity.toString()).toBe('1.5')
    expect(position.custoTotal.toString()).toBe('160800')
    expect(position.precoMedio.toString()).toBe('107200')
  })

  it('(c) sell 0,5 BTC -> quantity 1,0, custo 107200, preco medio UNCHANGED at 107200 (POS-03)', () => {
    const txs: Transaction[] = [
      buy({
        id: 1,
        date: '2026-07-01',
        quantity: '1',
        valueBrl: '100000',
        feeBrl: '500',
        createdAt: '2026-07-01T10:00:00.000Z',
      }),
      buy({
        id: 2,
        date: '2026-07-02',
        quantity: '0.5',
        valueBrl: '60000',
        feeBrl: '300',
        createdAt: '2026-07-02T10:00:00.000Z',
      }),
      sell({
        id: 3,
        date: '2026-07-03',
        quantity: '0.5',
        valueBrl: '0',
        feeBrl: '0',
        createdAt: '2026-07-03T10:00:00.000Z',
      }),
    ]

    const [position] = calculatePositions(txs)

    expect(position.quantity.toString()).toBe('1')
    expect(position.custoTotal.toString()).toBe('107200')
    // Byte-for-byte unchanged preco medio — this is the Brazilian rule.
    expect(position.precoMedio.toString()).toBe('107200')
  })

  it('(d) Decimal precision: three buys of R$333,33 each sum to exactly R$999,99 (would fail with native floats)', () => {
    const txs: Transaction[] = [
      buy({ id: 1, date: '2026-07-01', quantity: '0.001', valueBrl: '333.33', feeBrl: '0' }),
      buy({ id: 2, date: '2026-07-02', quantity: '0.001', valueBrl: '333.33', feeBrl: '0' }),
      buy({ id: 3, date: '2026-07-03', quantity: '0.001', valueBrl: '333.33', feeBrl: '0' }),
    ]

    const [position] = calculatePositions(txs)

    // Sanity: 0.1 + 0.2 !== 0.3 under native Number, so this assertion
    // would fail as "999.9899999999999" if the engine used native floats.
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(position.custoTotal.toString()).toBe('999.99')
  })

  it('(e) empty ledger -> empty positions', () => {
    expect(calculatePositions([])).toEqual([])
  })

  it('(f) asOf filter excludes later-dated transactions', () => {
    const txs: Transaction[] = [
      buy({ id: 1, date: '2026-07-01', quantity: '1', valueBrl: '100000', feeBrl: '500' }),
      buy({ id: 2, date: '2026-08-01', quantity: '1', valueBrl: '999999', feeBrl: '0' }),
    ]

    const positions = calculatePositions(txs, '2026-07-31')

    expect(positions).toHaveLength(1)
    expect(positions[0].quantity.toString()).toBe('1')
    expect(positions[0].custoTotal.toString()).toBe('100500')
  })
})
