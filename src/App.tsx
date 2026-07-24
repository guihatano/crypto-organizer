import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { TransactionListItem } from './api/client.ts'
import { usePrices, useTransactionsList } from './hooks/useTransactions.ts'
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

  return (
    <div className="min-h-svh bg-(--color-bg)">
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
              <EmptyState onCreateFirst={openNewTransaction} />
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
                    {/* D-10: export control lives inside the History toolbar.
                        Plain same-origin cookie-authenticated <a download> —
                        not fetch/blob, not apiClient (RESEARCH.md Export
                        mechanics). Import trigger is added in 06-02. */}
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
