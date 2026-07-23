import { useEffect, useState } from 'react'
import { useIrReport, useIrReportYears } from '../hooks/useTransactions.ts'
import { CadastrosPanel } from './CadastrosPanel.tsx'
import { IrCoinGroup } from './IrCoinGroup.tsx'

/**
 * Bens e Direitos report container (IR-01/IR-02/IR-03). Fetches the
 * available ledger years (D-01), preselects the last closed year exactly
 * once (D-02, never clobbering a year the user has since picked), and
 * renders the per-coin report for the selected year. Report values are
 * always BRL — never gated on or influenced by the dashboard's market
 * quote data or its display-mode toggle (isolation rule carried from
 * Phase 2).
 *
 * The "Cadastros para declaração" panel (D-09/D-07/IR-04, see 03-03)
 * mounts unconditionally below the report section — the user may want to
 * fill CNPJ/Grupo 08 sub-código before a year is even selected or while
 * the selected year's report is empty.
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

  const years = yearsData?.years ?? []
  const noYearAvailable =
    years.length === 0 || (yearsData?.default_year === null && selectedYear === null)

  return (
    <div className="space-y-10">
      <section aria-labelledby="ir-report-heading" className="space-y-6">
        <h2 id="ir-report-heading" className="text-lg font-medium text-[--color-text]">
          Relatório IR
        </h2>

        {yearsLoading && <p className="text-sm text-[--color-text-subtle]">Carregando...</p>}

        {!yearsLoading && yearsError && (
          <p className="text-sm text-[--color-destructive]">
            Não foi possível carregar o relatório de IR. Verifique se a API está rodando.
          </p>
        )}

        {!yearsLoading && !yearsError && noYearAvailable && (
          <div className="rounded-lg border border-[--color-border] p-4">
            <p className="text-sm font-medium text-[--color-text]">
              Nenhum ano disponível para declarar ainda.
            </p>
            <p className="mt-1 text-sm text-[--color-text-muted]">
              Registre suas transações de compra e venda para gerar o relatório de Bens e Direitos.
            </p>
          </div>
        )}

        {!yearsLoading && !yearsError && !noYearAvailable && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="ir-report-year" className="text-xs font-medium text-[--color-text-muted]">
                Ano-calendário
              </label>
              <select
                id="ir-report-year"
                value={selectedYear ?? ''}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="w-fit rounded-md border border-[--color-border] px-3 py-2 text-sm"
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

            {reportLoading && <p className="text-sm text-[--color-text-subtle]">Carregando...</p>}

            {reportError && (
              <p className="text-sm text-[--color-destructive]">
                Não foi possível carregar o relatório de IR. Verifique se a API está rodando.
              </p>
            )}

            {!reportLoading && !reportError && report && report.coins.length === 0 && (
              <div className="rounded-lg border border-[--color-border] p-4">
                <p className="text-sm font-medium text-[--color-text]">
                  Nenhuma posição em 31/12 de {report.year}.
                </p>
                <p className="mt-1 text-sm text-[--color-text-muted]">
                  Você não tinha nenhuma criptomoeda em carteira nessa data — não há nada para
                  declarar em Bens e Direitos nesse ano.
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
          </>
        )}
      </section>

      <CadastrosPanel />
    </div>
  )
}
