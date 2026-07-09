import { Decimal, toDecimal } from './decimal.ts'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
})

// Intl.NumberFormat('pt-BR', { style: 'currency', ... }) inserts a
// non-breaking space (U+00A0) between "R$" and the amount. Normalize it to
// a regular ASCII space so downstream string comparisons/tests/CSS don't
// have to special-case an invisible character.
const NON_BREAKING_SPACE = String.fromCharCode(0xa0)
const REGULAR_SPACE = String.fromCharCode(0x20)

/**
 * Formats a Decimal BRL amount as pt-BR currency, e.g. Decimal('1234.56')
 * -> 'R$ 1.234,56'. Display-only — never used for further arithmetic.
 */
export function formatBRL(value: Decimal | string | number): string {
  const decimal = toDecimal(value)
  // Round to 2dp via Decimal first (correct rounding), then hand a plain
  // number to Intl purely for locale formatting.
  const formatted = brlFormatter.format(Number(decimal.toFixed(2)))
  return formatted.split(NON_BREAKING_SPACE).join(REGULAR_SPACE)
}

/**
 * Formats a Decimal crypto quantity with pt-BR comma-decimal separator,
 * keeping up to 8 decimal places (e.g. 0.00314159 BTC), trimming trailing
 * zeros for round numbers.
 */
export function formatQuantity(value: Decimal | string | number): string {
  const decimal = toDecimal(value)
  return quantityFormatter.format(Number(decimal.toFixed(8)))
}

/**
 * Parses a pt-BR formatted BRL string (thousands separator '.', decimal
 * separator ',') into a Decimal, e.g. '1.234,56' -> Decimal 1234.56.
 * Also accepts plain '1234.56' / '1234,56' without thousands separators.
 */
export function parseBRLInput(value: string): Decimal {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  return new Decimal(normalized === '' ? 0 : normalized)
}

/**
 * Parses a pt-BR formatted quantity string into a Decimal, e.g.
 * '0,00314159' -> Decimal 0.00314159.
 */
export function parseQuantityInput(value: string): Decimal {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  return new Decimal(normalized === '' ? 0 : normalized)
}
