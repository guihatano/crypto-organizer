import { Decimal, toDecimal } from './decimal.ts'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const ptBRAmountFormatter = new Intl.NumberFormat('pt-BR', {
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
 * Formats a Decimal crypto quantity in the standard international format:
 * a dot decimal separator, exactly 8 decimal places, no thousands
 * separator and no locale (e.g. 1 -> '1.00000000', Decimal('0.00314159')
 * -> '0.00314159'). This is DELIBERATELY not pt-BR formatted — crypto
 * quantities are conventionally shown dot-decimal regardless of locale,
 * unlike BRL monetary amounts (formatBRL) which stay pt-BR. Uses
 * Decimal.js#toFixed directly (no native Number round-trip) so precision
 * is never at risk.
 */
export function formatQuantity(value: Decimal | string | number): string {
  return toDecimal(value).toFixed(8)
}

/**
 * Formats a Decimal amount in pt-BR style (thousands '.', decimal ',')
 * WITHOUT a currency symbol — used to prefill editable BRL-value text
 * inputs (e.g. taxa, valor recebido) so parseBRLInput can read the
 * result back correctly.
 */
export function formatAmountPtBR(value: Decimal | string | number): string {
  const decimal = toDecimal(value)
  return ptBRAmountFormatter.format(Number(decimal.toFixed(8)))
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
 * Parses a quantity string into a Decimal. Lenient about the decimal
 * separator so it can round-trip values produced by BOTH formatQuantity
 * (dot-decimal, e.g. '1.00000000') and pt-BR manual typing (comma-
 * decimal, e.g. '0,00314159'):
 *  - contains a comma -> pt-BR style: '.' stripped as thousands
 *    separator, ',' converted to the decimal point.
 *  - no comma -> treated as already dot-decimal (international format),
 *    parsed as-is.
 */
export function parseQuantityInput(value: string): Decimal {
  const trimmed = value.trim()
  if (trimmed === '') return new Decimal(0)
  if (trimmed.includes(',')) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.')
    return new Decimal(normalized)
  }
  return new Decimal(trimmed)
}
