import type { PriceRow } from '../api/client.ts'
import type { Decimal } from '../lib/decimal.ts'
import { toDecimal } from '../lib/decimal.ts'
import { formatBRL, formatPercent, formatQuantity, formatUSD } from '../lib/format.ts'

interface PositionTableProps {
  positions: PriceRow[]
  currency: 'BRL' | 'USD'
}

type MoneyFormatter = (value: Decimal | string | number) => string

/**
 * Signed "+R$ 1.234,56 (+12,3%)" / "+$1,234.56 (+12,3%)" style text for a
 * P&L cell. The money formatter itself has no signDisplay option (it's
 * shared with cost columns, which must never show a '+'), so the explicit
 * sign is prepended here from the Decimal's own sign — never derived by
 * re-parsing the formatted string. pnl_pct is currency-independent (a
 * ratio against the same-currency cost) so it's shared across both
 * branches.
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
  if (decimal.isZero()) return 'text-gray-700'
  return decimal.isNegative() ? 'text-red-600' : 'text-green-600'
}

/**
 * "de há {X}" age fragment for the stale badge (D-08), derived from the
 * per-coin fetched_at. Empty string when fetched_at is null (badge still
 * renders, just without the age fragment).
 */
function formatStaleAge(fetchedAt: string | null): string {
  if (!fetchedAt) return ''
  const diffMs = Math.max(0, Date.now() - new Date(fetchedAt).getTime())
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'poucos segundos'
  if (diffMin < 60) return `${diffMin} min`
  return `${Math.floor(diffMin / 60)} h`
}

/** Small grey "defasado" badge with an inline "de há {X}" age (D-08). */
function StaleBadge({ fetchedAt }: { fetchedAt: string | null }) {
  const age = formatStaleAge(fetchedAt)
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500">
      defasado{age && ` · de há ${age}`}
    </span>
  )
}

/**
 * Renders a market-value cell (Preço atual / Valor de mercado): "cotação
 * indisponível" placeholder (D-09) when the active-currency value is null,
 * otherwise the formatted value, grayed/italic + a StaleBadge when stale
 * (D-08). Never hides the row.
 */
function MarketCell({
  value,
  formatMoney,
  stale,
  fetchedAt,
}: {
  value: string | null
  formatMoney: MoneyFormatter
  stale: boolean
  fetchedAt: string | null
}) {
  if (value === null) {
    return <span className="text-gray-400 italic">cotação indisponível</span>
  }
  return (
    <>
      <span className={stale ? 'text-gray-400 italic' : undefined}>{formatMoney(value)}</span>
      {stale && <StaleBadge fetchedAt={fetchedAt} />}
    </>
  )
}

/**
 * Per-coin position view (D-10): Moeda | Quantidade | Preço Médio | Custo
 * Total (always BRL, D-07) plus the Phase 2 market columns — Preço atual,
 * Valor de mercado, P&L não realizado — which follow the active `currency`
 * toggle and degrade gracefully per cell (D-08/D-09) instead of ever
 * hiding a row.
 */
export function PositionTable({ positions, currency }: PositionTableProps) {
  const formatMoney = currency === 'USD' ? formatUSD : formatBRL

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
          <th scope="col" className="py-2 pr-4 font-medium">
            Moeda
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Quantidade
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Preço médio
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Custo total
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            Preço atual
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            Valor de mercado
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            P&amp;L não realizado
          </th>
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => {
          const price = currency === 'USD' ? position.price_usd : position.price_brl
          const marketValue = currency === 'USD' ? position.market_value_usd : position.market_value_brl
          const pnl = currency === 'USD' ? position.pnl_usd : position.pnl_brl

          return (
            <tr key={position.coin_id} className="border-b border-gray-100 last:border-0">
              <td className="whitespace-nowrap py-2 pr-4 font-medium text-gray-900">
                {position.symbol}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-gray-700">
                {formatQuantity(position.quantity)}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-gray-700">
                {formatBRL(position.preco_medio)}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-gray-700">
                {formatBRL(position.custo_total)}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-gray-700">
                <MarketCell
                  value={price}
                  formatMoney={formatMoney}
                  stale={position.stale}
                  fetchedAt={position.fetched_at}
                />
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-gray-700">
                <MarketCell
                  value={marketValue}
                  formatMoney={formatMoney}
                  stale={position.stale}
                  fetchedAt={position.fetched_at}
                />
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                {pnl === null ? (
                  <span className="text-gray-400 italic">
                    {marketValue === null ? 'cotação indisponível' : 'custo zero'}
                  </span>
                ) : (
                  <>
                    <span className={position.stale ? 'text-gray-400 italic' : pnlColorClass(pnl)}>
                      {formatSignedPnl(pnl, position.pnl_pct, formatMoney)}
                    </span>
                    {position.stale && <StaleBadge fetchedAt={position.fetched_at} />}
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
