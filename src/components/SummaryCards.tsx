import { Info } from 'lucide-react'
import type { PortfolioResponse } from '../api/client.ts'
import type { Decimal } from '../lib/decimal.ts'
import { toDecimal } from '../lib/decimal.ts'
import { formatBRL, formatPercent, formatUSD } from '../lib/format.ts'

interface SummaryCardsProps {
  data: PortfolioResponse
  currency: 'BRL' | 'USD'
}

type MoneyFormatter = (value: Decimal | string | number) => string

/**
 * Signed "+R$ 1.234,56 (+12,3%)" / "+$1,234.56 (+12,3%)" style text for the
 * P&L card. The money formatter has no signDisplay option (shared with cost
 * columns, which must never show a '+'), so the sign is prepended here from
 * the Decimal's own sign — never derived by re-parsing the formatted string.
 */
function formatSignedPnl(pnlValue: string, pnlPct: string | null, formatMoney: MoneyFormatter): string {
  const decimal = toDecimal(pnlValue)
  const amount = formatMoney(decimal.abs())
  const sign = decimal.isZero() ? '' : decimal.isNegative() ? '−' : '+'
  const pct = pnlPct !== null ? ` (${formatPercent(pnlPct)})` : ''
  return `${sign}${amount}${pct}`
}

/** Green for gains, red for losses, neutral gray for exactly zero. */
function pnlColorClass(pnlValue: string): string {
  const decimal = toDecimal(pnlValue)
  if (decimal.isZero()) return 'text-(--color-text)'
  return decimal.isNegative() ? 'text-(--color-loss)' : 'text-(--color-profit)'
}

/**
 * Discreet D-12 info icon + hover/focus tooltip explaining the FX caveat —
 * only rendered when USD is the active currency. Never a banner.
 */
function UsdFxTooltip() {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="Sobre o câmbio em USD"
        className="cursor-help text-(--color-text-subtle) hover:text-(--color-text-muted) focus:text-(--color-text-muted)"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-56 -translate-x-1/2 rounded-md bg-(--color-accent) px-2 py-1 text-xs font-normal text-(--color-accent-fg) opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        P&amp;L em USD usa o câmbio BRL/USD atual; o custo em BRL não muda
      </span>
    </span>
  )
}

/**
 * Aggregate dashboard row (POS-04/PRC-02/PRC-03/PRC-06) rendered above
 * PositionTable: total investido (always BRL, D-07), valor de mercado, and
 * lucro/prejuízo não realizado (both following the active `currency`
 * toggle) — with a partial-total warning when some coins have no quote
 * (D-10) and a discreet FX-caveat tooltip when USD is active (D-12).
 */
export function SummaryCards({ data, currency }: SummaryCardsProps) {
  const formatMoney = currency === 'USD' ? formatUSD : formatBRL
  const marketValue = currency === 'USD' ? data.total_market_value_usd : data.total_market_value_brl
  const pnl = currency === 'USD' ? data.total_pnl_usd : data.total_pnl_brl

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-lg border border-(--color-border) p-4">
          <p className="text-xs font-medium tracking-wide text-(--color-text-muted) uppercase">
            Total investido
          </p>
          <p className="mt-1 text-2xl font-semibold text-(--color-text)">
            {formatBRL(data.total_invested_brl)}
          </p>
        </div>

        <div className="rounded-lg border border-(--color-border) p-4">
          <p className="text-xs font-medium tracking-wide text-(--color-text-muted) uppercase">
            Valor de mercado
          </p>
          <p className="mt-1 text-2xl font-semibold text-(--color-text)">{formatMoney(marketValue)}</p>
        </div>

        <div className="rounded-lg border border-(--color-border) p-4">
          <p className="flex items-center text-xs font-medium tracking-wide text-(--color-text-muted) uppercase">
            Lucro/prejuízo não realizado
            {currency === 'USD' && <UsdFxTooltip />}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${pnlColorClass(pnl)}`}>
            {formatSignedPnl(pnl, data.total_pnl_pct, formatMoney)}
          </p>
        </div>
      </div>

      {data.coins_without_price > 0 && (
        <p className="mt-2 text-xs text-(--color-text-muted)">
          {data.coins_without_price} moeda(s) sem cotação — total parcial
        </p>
      )}
    </div>
  )
}
