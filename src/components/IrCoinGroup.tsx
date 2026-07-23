import type { IrReportCoin } from '../api/client.ts'
import { formatBRL } from '../lib/format.ts'
import { IrExchangeLineTable } from './IrExchangeLineTable.tsx'

interface IrCoinGroupProps {
  coin: IrReportCoin
}

/**
 * Amber "Declaração obrigatória" pill (IR-02), shown only when the coin's
 * custo total reaches R$5.000 (coin.meets_threshold). Copies the StaleBadge
 * pill shape from PositionTable, swapping gray for amber. Never used as an
 * error indicator — attention-worthy, not alarming.
 */
function ThresholdBadge() {
  return (
    <span className="w-fit whitespace-nowrap rounded bg-[--color-warning-bg] px-1 py-0.5 text-xs text-[--color-warning]">
      Declaração obrigatória
    </span>
  )
}

/**
 * One card per coin held on Dec 31 of the selected year (D-03). Header row
 * shows the symbol/name, the amber threshold badge when applicable, the
 * read-only Grupo 08 sub-código (editing lives in the Cadastros panel,
 * 03-03), and the coin's custo total. Below the header: one row per
 * (coin, exchange) pair via IrExchangeLineTable.
 */
export function IrCoinGroup({ coin }: IrCoinGroupProps) {
  return (
    <div className="rounded-lg border border-[--color-border] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[--color-text]">{coin.symbol}</span>
          <span className="text-[--color-text-muted]">{coin.name}</span>
          {coin.meets_threshold && <ThresholdBadge />}
          {coin.grupo08_subcodigo !== null && (
            <span className="text-xs font-medium text-[--color-text-muted]">
              Sub-código Grupo 08: {coin.grupo08_subcodigo}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs font-medium text-[--color-text-muted]">Custo total</span>
          <p className="text-base font-medium tabular-nums text-[--color-text]">{formatBRL(coin.custo_total)}</p>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <IrExchangeLineTable lines={coin.lines} />
      </div>
    </div>
  )
}
