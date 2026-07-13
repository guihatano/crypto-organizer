import { Decimal, toDecimal } from './decimal.ts'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// Money fields (BRL) always show exactly 2 decimal places, pt-BR style
// (thousands '.', decimal ','), unlike crypto quantities.
const moneyPtBRFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Percent formatter (P&L%): pt-BR, always-signed ('+'/'−', U+2212 minus per
// Intl), 1-2 decimal places.
const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  signDisplay: 'always',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
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
 * Formats a P&L fraction (e.g. market_value/custo - 1) as a signed pt-BR
 * percentage, e.g. 0.123 -> '+12,3%', -0.084 -> '−8,4%' (U+2212 minus),
 * 0 -> '+0,0%' (zero renders with the formatter's own sign, no color is
 * implied by the string itself — callers decide neutral styling by
 * checking the numeric value). Display-only — never used for further
 * arithmetic. Same shared signature as formatBRL/formatQuantity, routed
 * through toDecimal so the math chain never touches a native Number
 * directly (D-13).
 */
export function formatPercent(value: Decimal | string | number): string {
  const decimal = toDecimal(value)
  return percentFormatter.format(Number(decimal.toFixed(4)))
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
 * Formats a Decimal money amount in pt-BR style (thousands '.', decimal
 * ',') WITHOUT a currency symbol, always exactly 2 decimal places — used
 * to prefill/display editable BRL-value text inputs (e.g. valor total,
 * taxa, valor recebido) so parseBRLInput can read the result back
 * correctly.
 */
export function formatMoneyPtBR(value: Decimal | string | number): string {
  const decimal = toDecimal(value)
  return moneyPtBRFormatter.format(Number(decimal.toFixed(2)))
}

/**
 * Live money-mask helper for text inputs: given the CURRENT full input
 * string (after the user's latest keystroke — insertion or deletion),
 * extracts all digits and treats the last two as centavos (the
 * conventional "money mask" UX, e.g. typing 1 -> R$0,01, 12 -> R$0,12,
 * 100050000 -> R$1.000.500,00). Re-derives from the full string every
 * call (not incremental), so both typing and deleting digits behave
 * correctly. Returns both the pt-BR display string (feed back into the
 * input's `value`) and the normalized plain-decimal string (ready to
 * send to the API, or store as component state to hand off later).
 */
export function maskMoneyInput(raw: string): { display: string; normalized: string } {
  const digitsOnly = raw.replace(/\D/g, '')
  if (digitsOnly === '') {
    return { display: '', normalized: '0' }
  }
  const decimal = new Decimal(digitsOnly).div(100)
  return { display: formatMoneyPtBR(decimal), normalized: decimal.toString() }
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
