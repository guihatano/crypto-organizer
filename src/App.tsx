import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { TransactionListItem } from './api/client.ts'
import { usePrices, useTransactionsList } from './hooks/useTransactions.ts'
import { PositionTable } from './components/PositionTable.tsx'
import { SummaryCards } from './components/SummaryCards.tsx'
import { CurrencyToggle } from './components/CurrencyToggle.tsx'
import { TransactionHistory } from './components/TransactionHistory.tsx'
import { TransactionForm } from './components/TransactionForm.tsx'
import { EmptyState } from './components/EmptyState.tsx'

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

function App() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionListItem | null>(null)
  const [currency, setCurrency] = useState<'BRL' | 'USD'>(readStoredCurrency)

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
    <div className="min-h-svh bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Crypto Organizer</h1>
        <div className="flex flex-wrap items-center gap-3">
          {hasTransactions && (
            <>
              <CurrencyToggle value={currency} onChange={setCurrency} />
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>
                  {pricesFetching ? 'Atualizando…' : formatUpdatedAgo(portfolio?.fetched_at ?? null)}
                </span>
                <button
                  type="button"
                  onClick={() => refetchPrices()}
                  disabled={pricesFetching}
                  aria-label="Atualizar cotações"
                  title="Atualizar cotações"
                  className="cursor-pointer rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${pricesFetching ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={openNewTransaction}
            className="cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Nova transação
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        {isLoading && <p className="text-sm text-gray-400">Carregando...</p>}

        {isError && (
          <p className="text-sm text-red-500">
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
              <h2 id="positions-heading" className="mb-3 text-lg font-medium text-gray-900">
                Posições
              </h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 p-4">
                <PositionTable positions={portfolio.positions} currency={currency} />
              </div>
            </section>

            {/* History region (D-09) */}
            <section aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-3 text-lg font-medium text-gray-900">
                Histórico de transações
              </h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 p-4">
                <TransactionHistory
                  transactions={transactionsList ?? []}
                  onEdit={openEditTransaction}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <TransactionForm open={formOpen} onClose={closeForm} editingTransaction={editingTransaction} />
    </div>
  )
}

export default App
