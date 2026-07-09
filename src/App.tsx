import { useState } from 'react'
import type { TransactionListItem } from './api/client.ts'
import { usePositions, useTransactionsList } from './hooks/useTransactions.ts'
import { PositionTable } from './components/PositionTable.tsx'
import { TransactionHistory } from './components/TransactionHistory.tsx'
import { TransactionForm } from './components/TransactionForm.tsx'
import { EmptyState } from './components/EmptyState.tsx'

function App() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionListItem | null>(null)

  const { data: positions, isLoading: positionsLoading, isError: positionsError } =
    usePositions()
  const {
    data: transactionsList,
    isLoading: transactionsLoading,
    isError: transactionsError,
  } = useTransactionsList()

  const isLoading = positionsLoading || transactionsLoading
  const isError = positionsError || transactionsError
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
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900">Crypto Organizer</h1>
        <button
          type="button"
          onClick={openNewTransaction}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Nova transação
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">
        {isLoading && <p className="text-sm text-gray-400">Carregando...</p>}

        {isError && (
          <p className="text-sm text-red-500">
            Não foi possível carregar os dados. Verifique se a API está rodando.
          </p>
        )}

        {!isLoading && !isError && !hasTransactions && (
          <EmptyState onCreateFirst={openNewTransaction} />
        )}

        {!isLoading && !isError && hasTransactions && (
          <>
            {/* Positions region (D-09/D-10) */}
            <section aria-labelledby="positions-heading">
              <h2 id="positions-heading" className="mb-3 text-lg font-medium text-gray-900">
                Posições
              </h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 p-4">
                <PositionTable positions={positions ?? []} />
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
