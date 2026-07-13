import type { PortfolioResponse } from '../api/client.ts'
import { toDecimal } from '../lib/decimal.ts'
import { formatBRL, formatPercent } from '../lib/format.ts'

interface SummaryCardsProps {
  data: PortfolioResponse
  currency: 'BRL' | 'USD'
}

/**
 * Signed "+R$ 1.234,56 (+12,3%)" style text for the P&L card. formatBRL has
 * no signDisplay option (shared with cost columns, which must never show a
 * '+'), so the sign is prepended here from the Decimal's own sign — never
 * derived by re-parsing the formatted string.
 */
function formatSignedPnl(pnlValue: string, pnlPct: string | null): string {
  const decimal = toDecimal(pnlValue)
  const amount = formatBRL(decimal.abs())
  const sign = decimal.isZero() ? '' : decimal.isNegative() ? '−' : '+'
  const pct = pnlPct !== null ? ` (${formatPercent(pnlPct)})` : ''
  return `${sign}${amount}${pct}`
}

/** Green for gains, red for losses, neutral gray for exactly zero. */
function pnlColorClass(pnlValue: string): string {
  const decimal = toDecimal(pnlValue)
  if (decimal.isZero()) return 'text-gray-700'
  return decimal.isNegative() ? 'text-red-600' : 'text-green-600'
}

/**
 * Aggregate dashboard row (POS-04/PRC-02/PRC-03) rendered above
 * PositionTable: total investido (always BRL, D-07), valor de mercado, and
 * lucro/prejuízo não realizado — with a partial-total warning when some
 * coins have no quote (D-10).
 */
export function SummaryCards({ data, currency }: SummaryCardsProps) {
  // The `currency` prop exists for interface parity with plan 02-03, which
  // adds the USD branch (formatUSD) for these two market-following cards.
  // This plan (02-02) only renders BRL market values.
  void currency

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Total investido
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatBRL(data.total_invested_brl)}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Valor de mercado
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatBRL(data.total_market_value_brl)}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Lucro/prejuízo não realizado
          </p>
          <p className={`mt-1 text-2xl font-semibold ${pnlColorClass(data.total_pnl_brl)}`}>
            {formatSignedPnl(data.total_pnl_brl, data.total_pnl_pct)}
          </p>
        </div>
      </div>

      {data.coins_without_price > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {data.coins_without_price} moeda(s) sem cotação — total parcial
        </p>
      )}
    </div>
  )
}
