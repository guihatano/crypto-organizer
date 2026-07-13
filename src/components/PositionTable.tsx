import type { PriceRow } from '../api/client.ts'
import { toDecimal } from '../lib/decimal.ts'
import { formatBRL, formatPercent, formatQuantity } from '../lib/format.ts'

interface PositionTableProps {
  positions: PriceRow[]
  currency: 'BRL' | 'USD'
}

/**
 * Signed "+R$ 1.234,56 (+12,3%)" style text for a P&L cell/card. formatBRL
 * itself has no signDisplay option (it's shared with cost columns, which
 * must never show a '+'), so the explicit sign is prepended here from the
 * Decimal's own sign — never derived by re-parsing the formatted string.
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
 * Per-coin position view (D-10): Moeda | Quantidade | Preço Médio | Custo
 * Total (always BRL, D-07) plus the Phase 2 market columns — Preço atual,
 * Valor de mercado, P&L não realizado — which degrade gracefully per cell
 * (D-08/D-09) instead of ever hiding a row.
 */
export function PositionTable({ positions, currency }: PositionTableProps) {
  // The `currency` prop exists for interface parity with plan 02-03, which
  // adds the USD branch (formatUSD) for these market columns. This plan
  // (02-02) only renders BRL market values.
  void currency

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
        {positions.map((position) => (
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
              {position.price_brl === null ? (
                <span className="text-gray-400 italic">cotação indisponível</span>
              ) : (
                <span className={position.stale ? 'text-gray-400 italic' : undefined}>
                  {formatBRL(position.price_brl)}
                </span>
              )}
            </td>
            <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-gray-700">
              {position.market_value_brl === null ? (
                <span className="text-gray-400 italic">cotação indisponível</span>
              ) : (
                <span className={position.stale ? 'text-gray-400 italic' : undefined}>
                  {formatBRL(position.market_value_brl)}
                </span>
              )}
            </td>
            <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
              {position.pnl_brl === null ? (
                <span className="text-gray-400 italic">cotação indisponível</span>
              ) : (
                <span className={position.stale ? 'text-gray-400 italic' : pnlColorClass(position.pnl_brl)}>
                  {formatSignedPnl(position.pnl_brl, position.pnl_pct)}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
