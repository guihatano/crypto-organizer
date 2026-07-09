import { describe, expect, it } from 'vitest'
import { validateSellTransaction } from '../validation.ts'
import type { Transaction } from '../types.ts'

describe('validateSellTransaction', () => {
  it('rejects an out-of-order sell even when the net total is non-negative (D-07/D-08)', () => {
    const existing: Transaction[] = [
      {
        id: 1,
        date: '2026-07-10',
        type: 'buy',
        coinId: 1,
        quantity: '1',
        valueBrl: '100000',
        feeBrl: '0',
        createdAt: '2026-07-10T10:00:00.000Z',
      },
      {
        id: 2,
        date: '2026-07-05',
        type: 'sell',
        coinId: 1,
        quantity: '0.5',
        valueBrl: '0',
        feeBrl: '0',
        createdAt: '2026-07-05T10:00:00.000Z',
      },
    ]

    // Net total: 1 (buy) - 0.5 (existing sell) - 0.5 (candidate) = 0 —
    // non-negative. But chronologically, at 2026-07-05 there is no BTC
    // yet (the buy happens later, on 2026-07-10), so this must be
    // rejected.
    const result = validateSellTransaction(
      { date: '2026-07-05', coinId: 1, quantity: '0.5' },
      existing,
    )

    expect(result.valid).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('rejects a simple oversell', () => {
    const existing: Transaction[] = [
      {
        id: 1,
        date: '2026-07-01',
        type: 'buy',
        coinId: 1,
        quantity: '1',
        valueBrl: '100000',
        feeBrl: '0',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]

    const result = validateSellTransaction(
      { date: '2026-07-02', coinId: 1, quantity: '2' },
      existing,
    )

    expect(result.valid).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('accepts a valid sell within holdings', () => {
    const existing: Transaction[] = [
      {
        id: 1,
        date: '2026-07-01',
        type: 'buy',
        coinId: 1,
        quantity: '1',
        valueBrl: '100000',
        feeBrl: '0',
        createdAt: '2026-07-01T10:00:00.000Z',
      },
    ]

    const result = validateSellTransaction(
      { date: '2026-07-02', coinId: 1, quantity: '0.5' },
      existing,
    )

    expect(result).toEqual({ valid: true })
  })
})
