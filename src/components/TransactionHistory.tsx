import type { TransactionListItem } from '../api/client.ts'
import { formatBRL, formatQuantity } from '../lib/format.ts'

interface TransactionHistoryProps {
  transactions: TransactionListItem[]
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
 * Quantidade | Valor | Taxa | Exchange | Ações. The Ações column (edit/
 * delete) is wired in Wave 3 once PATCH/DELETE exist.
 */
export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  return (
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
            <td className="py-2 pr-4 text-gray-400">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
