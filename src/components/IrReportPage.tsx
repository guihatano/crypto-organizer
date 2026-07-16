import { useEffect, useState } from 'react'
import { useIrReport, useIrReportYears } from '../hooks/useTransactions.ts'
import { IrCoinGroup } from './IrCoinGroup.tsx'

/**
 * Bens e Direitos report container (IR-01/IR-02/IR-03). Fetches the
 * available ledger years (D-01), preselects the last closed year exactly
 * once (D-02, never clobbering a year the user has since picked), and
 * renders the per-coin report for the selected year. Report values are
 * always BRL — never gated on or influenced by the dashboard's price data
 * or BRL/USD toggle (isolation rule carried from Phase 2).
 */
export function IrReportPage() {
  const { data: yearsData, isLoading: yearsLoading, isError: yearsError } = useIrReportYears()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (initialized || !yearsData) return
    setSelectedYear(yearsData.default_year)
    setInitialized(true)
  }, [initialized, yearsData])

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
  } = useIrReport(selectedYear)

  if (yearsLoading) {
    return <p className="text-sm text-gray-400">Carregando...</p>
  }

  if (yearsError) {
    return (
      <p className="text-sm text-red-500">
        Não foi possível carregar o relatório de IR. Verifique se a API está rodando.
      </p>
    )
  }

  const years = yearsData?.years ?? []
  const noYearAvailable = years.length === 0 || (yearsData?.default_year === null && selectedYear === null)

  if (noYearAvailable) {
    return (
      <section aria-labelledby="ir-report-heading" className="space-y-3">
        <h2 id="ir-report-heading" className="text-lg font-medium text-gray-900">
          Relatório IR
        </h2>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">Nenhum ano disponível para declarar ainda.</p>
          <p className="mt-1 text-sm text-gray-500">
            Registre suas transações de compra e venda para gerar o relatório de Bens e Direitos.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="ir-report-heading" className="space-y-6">
      <h2 id="ir-report-heading" className="text-lg font-medium text-gray-900">
        Relatório IR
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="ir-report-year" className="text-xs font-medium text-gray-500">
          Ano-calendário
        </label>
        <select
          id="ir-report-year"
          value={selectedYear ?? ''}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          className="w-fit rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {selectedYear === null && (
            <option value="" disabled>
              Selecione um ano
            </option>
          )}
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {reportLoading && <p className="text-sm text-gray-400">Carregando...</p>}

      {reportError && (
        <p className="text-sm text-red-500">
          Não foi possível carregar o relatório de IR. Verifique se a API está rodando.
        </p>
      )}

      {!reportLoading && !reportError && report && report.coins.length === 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">Nenhuma posição em 31/12 de {report.year}.</p>
          <p className="mt-1 text-sm text-gray-500">
            Você não tinha nenhuma criptomoeda em carteira nessa data — não há nada para declarar em Bens e
            Direitos nesse ano.
          </p>
        </div>
      )}

      {!reportLoading && !reportError && report && report.coins.length > 0 && (
        <div className="space-y-4">
          {report.coins.map((coin) => (
            <IrCoinGroup key={coin.coin_id} coin={coin} />
          ))}
        </div>
      )}
    </section>
  )
}
