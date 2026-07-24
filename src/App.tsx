import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import { ApiError, type ImportBackupRowError, type TransactionListItem } from './api/client.ts'
import { ImportError, useImportBackup, usePrices, useTransactionsList } from './hooks/useTransactions.ts'
import { useAuthStatus } from './hooks/useAuth.ts'
import { PositionTable } from './components/PositionTable.tsx'
import { SummaryCards } from './components/SummaryCards.tsx'
import { CurrencyToggle } from './components/CurrencyToggle.tsx'
import { TransactionHistory } from './components/TransactionHistory.tsx'
import { TransactionForm } from './components/TransactionForm.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { ViewSwitcher, type AppView } from './components/ViewSwitcher.tsx'
import { IrReportPage } from './components/IrReportPage.tsx'
import { SetupForm } from './components/SetupForm.tsx'
import { LoginForm } from './components/LoginForm.tsx'
import { LogoutButton } from './components/LogoutButton.tsx'
import { ModeToggle } from './components/ModeToggle.tsx'

const CURRENCY_STORAGE_KEY = 'currency'

/**
 * Reads the persisted currency preference defensively (T-02-07): only the
 * literal 'BRL' selects BRL — any other stored value (tampered, absent, or
 * anything else) falls back to the D-06 default of USD on first load.
 */
function readStoredCurrency(): 'BRL' | 'USD' {
  return localStorage.getItem(CURRENCY_STORAGE_KEY) === 'BRL' ? 'BRL' : 'USD'
}

/**
 * "Atualizado há {X}" indicator (D-04) derived from PortfolioResponse's
 * fetched_at. Never-fetched (fetched_at null) shows the D-04 copy for that
 * state instead of a bogus duration.
 */
function formatUpdatedAgo(fetchedAt: string | null): string {
  if (!fetchedAt) return 'Cotações ainda não carregadas'
  const diffMs = Math.max(0, Date.now() - new Date(fetchedAt).getTime())
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Atualizado há poucos segundos'
  if (diffMin < 60) return `Atualizado há ${diffMin} min`
  return `Atualizado há ${Math.floor(diffMin / 60)} h`
}

// D-11/UI-SPEC Copywriting Contract pluralization rule: singular exactly
// at count 1, plural for 0 and >=2.
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

function buildImportSuccessSummary(imported: number, duplicatesSkipped: number): string {
  if (imported === 0 && duplicatesSkipped > 0) {
    return `Nenhuma transação nova — todas as ${duplicatesSkipped} linhas já existiam (duplicadas).`
  }
  const txWord = pluralize(imported, 'transação', 'transações')
  const importedWord = pluralize(imported, 'importada', 'importadas')
  const dupWord = pluralize(duplicatesSkipped, 'duplicada', 'duplicadas')
  const ignoredWord = pluralize(duplicatesSkipped, 'ignorada', 'ignoradas')
  return `${imported} ${txWord} ${importedWord}, ${duplicatesSkipped} ${dupWord} ${ignoredWord}.`
}

function buildNewExchangesSentence(newExchanges: string[]): string | null {
  if (newExchanges.length === 0) return null
  const noun = pluralize(newExchanges.length, 'exchange nova criada', 'exchanges novas criadas')
  return `${newExchanges.length} ${noun}: ${newExchanges.join(', ')}.`
}

function buildImportRejectionSummary(rows: ImportBackupRowError[]): string {
  const noun = pluralize(rows.length, 'erro encontrado', 'erros encontrados')
  return `${rows.length} ${noun}. Nenhuma transação foi importada — corrija o arquivo e tente novamente.`
}

/**
 * Owned at App level (not local to EmptyState/History) so it survives the
 * EmptyState -> History view flip a successful zero-transactions import
 * triggers (UI-SPEC Component Notes "Result panel ownership").
 */
type ImportResultState =
  | { kind: 'success'; summary: string; newExchangesSentence: string | null }
  | { kind: 'error-rows'; summary: string; rows: ImportBackupRowError[] }
  | { kind: 'error-message'; message: string }

/**
 * The auth-status-driven shell (D-05): renders exactly one of
 * Checking / Setup / Login / App from GET /api/auth/status, with no
 * router — a plain conditional render, the same pattern ViewSwitcher
 * already uses for Dashboard/Relatório IR. The client never decides auth
 * locally as the security boundary; every state here is a direct
 * reflection of server state.
 */
function App() {
  const { data: authStatus, isLoading: authLoading, isError: authError } = useAuthStatus()

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-(--color-bg)">
        <p className="text-sm text-(--color-text-subtle)">Carregando...</p>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-(--color-bg) px-4">
        <p className="text-sm text-(--color-destructive)">
          Não foi possível verificar o login. Verifique se o servidor está rodando.
        </p>
      </div>
    )
  }

  if (authStatus?.setup_required) {
    return <SetupForm />
  }

  if (!authStatus?.authenticated) {
    return <LoginForm />
  }

  return <AuthenticatedApp />
}

/**
 * Today's existing authenticated app (header + main), unchanged apart
 * from the added Sair control in the header.
 */
function AuthenticatedApp() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionListItem | null>(null)
  const [currency, setCurrency] = useState<'BRL' | 'USD'>(readStoredCurrency)
  const [view, setView] = useState<AppView>('dashboard')
  const [importResult, setImportResult] = useState<ImportResultState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importBackup = useImportBackup()

  useEffect(() => {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency)
  }, [currency])

  const {
    data: portfolio,
    isLoading: pricesLoading,
    isError: pricesError,
    isFetching: pricesFetching,
    refetch: refetchPrices,
  } = usePrices()
  const {
    data: transactionsList,
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = useTransactionsList()

  const isLoading = pricesLoading || transactionsLoading
  const isError = pricesError || transactionsError
  const hasTransactions = (transactionsList?.length ?? 0) > 0

  function openNewTransaction() {
    setEditingTransaction(null)
    setFormOpen(true)
  }

  function openEditTransaction(transaction: TransactionListItem) {
    setEditingTransaction(transaction)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingTransaction(null)
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleImportError(err: unknown) {
    if (err instanceof ImportError && err.rows && err.rows.length > 0) {
      setImportResult({
        kind: 'error-rows',
        summary: buildImportRejectionSummary(err.rows),
        rows: err.rows,
      })
      return
    }
    const message =
      err instanceof ApiError ? err.message : 'Não foi possível conectar ao servidor. Tente novamente.'
    setImportResult({ kind: 'error-message', message })
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportResult({ kind: 'error-message', message: 'Selecione um arquivo .csv.' })
      return
    }

    importBackup.mutate(file, {
      onSuccess: (result) => {
        setImportResult({
          kind: 'success',
          summary: buildImportSuccessSummary(result.imported, result.duplicates_skipped),
          newExchangesSentence: buildNewExchangesSentence(result.new_exchanges),
        })
      },
      onError: handleImportError,
    })
  }

  return (
    <div className="min-h-svh bg-(--color-bg)">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={handleFileInputChange}
      />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) px-4 py-4 sm:px-6">
        <h1 className="text-xl font-semibold text-(--color-text) sm:text-2xl">Crypto Organizer</h1>
        <div className="flex flex-wrap items-center gap-3">
          {hasTransactions && (
            <>
              <ViewSwitcher value={view} onChange={setView} />
              {view === 'dashboard' && (
                <>
                  <CurrencyToggle value={currency} onChange={setCurrency} />
                  <div className="flex items-center gap-1 text-xs text-(--color-text-muted)">
                    <span>
                      {pricesFetching ? 'Atualizando…' : formatUpdatedAgo(portfolio?.fetched_at ?? null)}
                    </span>
                    <button
                      type="button"
                      onClick={() => refetchPrices()}
                      disabled={pricesFetching}
                      aria-label="Atualizar cotações"
                      title="Atualizar cotações"
                      className="cursor-pointer rounded-md p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${pricesFetching ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <button
            type="button"
            onClick={openNewTransaction}
            className="cursor-pointer rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:bg-(--color-accent-hover)"
          >
            Nova transação
          </button>
          <ModeToggle />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        {importResult && (
          <div
            role={importResult.kind === 'success' ? 'status' : 'alert'}
            aria-live={importResult.kind === 'success' ? 'polite' : 'assertive'}
            className="relative rounded-lg border border-(--color-border) bg-(--color-surface) p-4"
          >
            <button
              type="button"
              onClick={() => setImportResult(null)}
              aria-label={importResult.kind === 'success' ? 'Fechar resumo' : 'Fechar erro'}
              className="absolute top-3 right-3 cursor-pointer rounded-md p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-hover)"
            >
              <X className="h-4 w-4" />
            </button>

            {importResult.kind === 'success' ? (
              <>
                <p className="flex items-center gap-1.5 pr-8 text-sm font-semibold text-(--color-text)">
                  <Check className="h-4 w-4 text-(--color-profit)" />
                  Import concluído
                </p>
                <p className="mt-1 pr-8 text-sm text-(--color-text-muted)">
                  <span className="text-(--color-profit)">{importResult.summary}</span>
                  {importResult.newExchangesSentence && <> {importResult.newExchangesSentence}</>}
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-1.5 pr-8 text-sm font-semibold text-(--color-destructive)">
                  <AlertTriangle className="h-4 w-4" />
                  Import não aplicado
                </p>
                {importResult.kind === 'error-rows' ? (
                  <>
                    <p className="mt-1 pr-8 text-sm text-(--color-text-muted)">{importResult.summary}</p>
                    <ul className="mt-2 max-h-72 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-(--color-destructive)">
                      {importResult.rows.map((row) => (
                        <li key={row.line}>
                          Linha {row.line}: {row.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 pr-8 text-sm text-(--color-text-muted)">{importResult.message}</p>
                )}
              </>
            )}
          </div>
        )}

        {view === 'ir-report' && hasTransactions ? (
          // The IR report is not gated on usePrices (portfolio) — cost/IR
          // data is isolated from the price layer and must render even
          // when the price API is down.
          <IrReportPage />
        ) : (
          <>
            {isLoading && <p className="text-sm text-(--color-text-subtle)">Carregando...</p>}

            {isError && (
              <p className="text-sm text-(--color-destructive)">
                Não foi possível carregar os dados. Verifique se a API está rodando.
              </p>
            )}

            {!isLoading && !isError && !hasTransactions && (
              <EmptyState onCreateFirst={openNewTransaction} onImportClick={openFilePicker} />
            )}

            {!isLoading && !isError && hasTransactions && portfolio && (
              <>
                {/* Summary dashboard (POS-04/PRC-02/PRC-03) */}
                <SummaryCards data={portfolio} currency={currency} />

                {/* Positions region (D-09/D-10) */}
                <section aria-labelledby="positions-heading">
                  <h2 id="positions-heading" className="mb-3 text-lg font-medium text-(--color-text)">
                    Posições
                  </h2>
                  <div className="overflow-x-auto rounded-lg border border-(--color-border) p-4">
                    <PositionTable positions={portfolio.positions} currency={currency} />
                  </div>
                </section>

                {/* History region (D-09) */}
                <section aria-labelledby="history-heading">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 id="history-heading" className="text-lg font-medium text-(--color-text)">
                      Histórico de transações
                    </h2>
                    {/* D-10: export/import controls live inside the History
                        toolbar. Export is a plain same-origin
                        cookie-authenticated <a download> — not fetch/blob,
                        not apiClient (RESEARCH.md Export mechanics). Import
                        stays enabled here even while an import is pending —
                        read-only GET, no write conflict. */}
                    <div className="flex items-center gap-1.5">
                      <a
                        href="/api/backup/export.csv"
                        download
                        className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5">
                          <Download className="h-4 w-4" />
                          Exportar CSV
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={openFilePicker}
                        disabled={importBackup.isPending}
                        aria-busy={importBackup.isPending}
                        className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-(--color-text-muted) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5">
                          {importBackup.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {importBackup.isPending ? 'Importando...' : 'Importar CSV'}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-(--color-border) p-4">
                    <TransactionHistory
                      transactions={transactionsList ?? []}
                      onEdit={openEditTransaction}
                    />
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>

      <TransactionForm open={formOpen} onClose={closeForm} editingTransaction={editingTransaction} />
    </div>
  )
}

export default App
