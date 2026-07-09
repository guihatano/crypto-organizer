import { useState } from 'react'
import type { TransactionListItem } from '../api/client.ts'
import { formatBRL, formatQuantity } from '../lib/format.ts'
import { useDeleteTransaction } from '../hooks/useTransactions.ts'
import { DeleteConfirmDialog } from './DeleteConfirmDialog.tsx'

interface TransactionHistoryProps {
  transactions: TransactionListItem[]
  onEdit: (transaction: TransactionListItem) => void
}

const TYPE_LABEL: Record<TransactionListItem['type'], string> = {
  buy: 'Compra',
  sell: 'Venda',
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Chronological transaction history (TX-03/TX-07): Data | Tipo | Moeda |
 * Quantidade | Valor | Taxa | Exchange | Ações. Editar opens the modal
 * prefilled (TX-04); Excluir requires confirmation before DELETE (D-12).
 */
export function TransactionHistory({ transactions, onEdit }: TransactionHistoryProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const deleteTransaction = useDeleteTransaction()

  function handleConfirmDelete() {
    if (pendingDeleteId == null) return
    deleteTransaction.mutate(pendingDeleteId, {
      onSuccess: () => setPendingDeleteId(null),
    })
  }

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="py-2 pr-4 font-medium">
              Data
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Tipo
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Moeda
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Quantidade
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Valor
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Taxa
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Exchange
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-gray-100 last:border-0">
              <td className="py-2 pr-4 text-gray-700">{formatDate(tx.date)}</td>
              <td className="py-2 pr-4 text-gray-700">{TYPE_LABEL[tx.type]}</td>
              <td className="py-2 pr-4 font-medium text-gray-900">{tx.coin_symbol}</td>
              <td className="py-2 pr-4 text-gray-700">{formatQuantity(tx.quantity)}</td>
              <td className="py-2 pr-4 text-gray-700">{formatBRL(tx.value_brl)}</td>
              <td className="py-2 pr-4 text-gray-700">{formatBRL(tx.fee_brl)}</td>
              <td className="py-2 pr-4 text-gray-700">{tx.exchange_name}</td>
              <td className="py-2 pr-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                    onClick={() => onEdit(tx)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
                    onClick={() => setPendingDeleteId(tx.id)}
                  >
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <DeleteConfirmDialog
        open={pendingDeleteId != null}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={handleConfirmDelete}
        isPending={deleteTransaction.isPending}
      />
    </>
  )
}
