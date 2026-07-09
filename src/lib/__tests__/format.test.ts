import { describe, expect, it } from 'vitest'
import { Decimal } from '../decimal.ts'
import { formatBRL, formatQuantity, parseBRLInput, parseQuantityInput } from '../format.ts'

describe('formatBRL', () => {
  it("formats Decimal('1234.56') as 'R$ 1.234,56'", () => {
    expect(formatBRL(new Decimal('1234.56'))).toBe('R$ 1.234,56')
  })
})

describe('formatQuantity', () => {
  it('keeps 8 decimal places with a DOT decimal separator (international format, not pt-BR)', () => {
    expect(formatQuantity('0.00314159')).toBe('0.00314159')
  })

  it('always shows exactly 8 decimal places, even for whole numbers', () => {
    expect(formatQuantity('1')).toBe('1.00000000')
    expect(formatQuantity(new Decimal('0.5'))).toBe('0.50000000')
  })
})

describe('parseBRLInput', () => {
  it("parses '1.234,56' into Decimal 1234.56", () => {
    expect(parseBRLInput('1.234,56').toString()).toBe('1234.56')
  })
})

describe('parseQuantityInput', () => {
  it("parses '0,00314159' (pt-BR comma-decimal) into Decimal 0.00314159", () => {
    expect(parseQuantityInput('0,00314159').toString()).toBe('0.00314159')
  })

  it("parses '1.00000000' (dot-decimal, as produced by formatQuantity) into Decimal 1", () => {
    expect(parseQuantityInput('1.00000000').toString()).toBe('1')
  })

  it('round-trips formatQuantity output back into the same Decimal value', () => {
    const original = new Decimal('0.5')
    const displayed = formatQuantity(original)
    expect(parseQuantityInput(displayed).toString()).toBe(original.toString())
  })
})
