import { describe, expect, it } from 'vitest'
import { Decimal } from '../decimal.ts'
import { formatBRL, formatQuantity, parseBRLInput, parseQuantityInput } from '../format.ts'

describe('formatBRL', () => {
  it("formats Decimal('1234.56') as 'R$ 1.234,56'", () => {
    expect(formatBRL(new Decimal('1234.56'))).toBe('R$ 1.234,56')
  })
})

describe('formatQuantity', () => {
  it("keeps 8 decimal places with a comma decimal separator", () => {
    expect(formatQuantity('0.00314159')).toBe('0,00314159')
  })
})

describe('parseBRLInput', () => {
  it("parses '1.234,56' into Decimal 1234.56", () => {
    expect(parseBRLInput('1.234,56').toString()).toBe('1234.56')
  })
})

describe('parseQuantityInput', () => {
  it("parses '0,00314159' into Decimal 0.00314159", () => {
    expect(parseQuantityInput('0,00314159').toString()).toBe('0.00314159')
  })
})
