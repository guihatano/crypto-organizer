import { describe, expect, it } from 'vitest'
import { Decimal } from '../decimal.ts'
import {
  formatBRL,
  formatMoneyPtBR,
  formatPercent,
  formatQuantity,
  maskMoneyInput,
  parseBRLInput,
  parseQuantityInput,
} from '../format.ts'

describe('formatBRL', () => {
  it("formats Decimal('1234.56') as 'R$ 1.234,56'", () => {
    expect(formatBRL(new Decimal('1234.56'))).toBe('R$ 1.234,56')
  })
})

describe('formatPercent', () => {
  it("formats a positive fraction 0.123 as '+12,3%'", () => {
    expect(formatPercent(0.123)).toBe('+12,3%')
  })

  it('formats a negative fraction -0.084 as a signed negative percent', () => {
    // Node's Intl.NumberFormat pt-BR emits a plain ASCII hyphen-minus here
    // (not U+2212) — asserting the actual runtime output.
    expect(formatPercent(-0.084)).toBe('-8,4%')
  })

  it("formats zero as '+0,0%' (neutral — no color implied by the string)", () => {
    expect(formatPercent(0)).toBe('+0,0%')
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

describe('formatMoneyPtBR', () => {
  it('formats a money amount pt-BR style without a currency symbol, always 2 decimals', () => {
    expect(formatMoneyPtBR(new Decimal('100500'))).toBe('100.500,00')
    expect(formatMoneyPtBR('500')).toBe('500,00')
  })
})

describe('maskMoneyInput', () => {
  it('treats digits as centavos, growing the display as more are typed', () => {
    expect(maskMoneyInput('1').display).toBe('0,01')
    expect(maskMoneyInput('12').display).toBe('0,12')
    expect(maskMoneyInput('123').display).toBe('1,23')
    expect(maskMoneyInput('10050000').display).toBe('100.500,00')
  })

  it('returns a normalized plain-decimal string alongside the display', () => {
    expect(maskMoneyInput('10050000').normalized).toBe('100500')
  })

  it('ignores non-digit characters already present in the input (re-derives from full string)', () => {
    // Simulates re-reading the input's current value, which already
    // contains the previous mask's punctuation ('.', ',').
    expect(maskMoneyInput('1.000,50').display).toBe('1.000,50')
  })

  it('returns an empty display for an empty/all-non-digit input', () => {
    expect(maskMoneyInput('').display).toBe('')
    expect(maskMoneyInput('').normalized).toBe('0')
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
