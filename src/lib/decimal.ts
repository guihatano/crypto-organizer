import Decimal from 'decimal.js'

// Non-negotiable per CLAUDE.md Decimal Math: every arithmetic step on
// money (BRL) or crypto quantities uses Decimal.js — never native Number.
// precision=28 significant digits comfortably covers >=8 decimal places on
// both BRL amounts and fractional crypto quantities (e.g. 0.00003782 BTC)
// without losing precision on large totals.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export { Decimal }

/**
 * Parse a raw string (as stored in SQLite TEXT columns, or user input
 * already normalized to a plain numeric string) into a Decimal. Throws if
 * the value is not a finite, parseable number — callers should validate
 * user input with parseBRLInput/parseQuantityInput (src/lib/format.ts)
 * before this point.
 */
export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value)
}

export const ZERO = new Decimal(0)
