import type { Position } from '../api/client.ts'
import { formatBRL, formatQuantity } from '../lib/format.ts'

interface PositionTableProps {
  positions: Position[]
}

/**
 * Per-coin position view (D-10): Moeda | Quantidade | Preço Médio | Custo
 * Total, all pt-BR formatted. Table structure leaves room for Phase 2
 * market-price columns (current price, market value, unrealized P&L).
 */
export function PositionTable({ positions }: PositionTableProps) {
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
        </tr>
      </thead>
      <tbody>
        {positions.map((position) => (
          <tr key={position.coin_id} className="border-b border-gray-100 last:border-0">
            <td className="py-2 pr-4 font-medium text-gray-900">{position.symbol}</td>
            <td className="py-2 pr-4 text-gray-700">{formatQuantity(position.quantity)}</td>
            <td className="py-2 pr-4 text-gray-700">{formatBRL(position.preco_medio)}</td>
            <td className="py-2 pr-4 text-gray-700">{formatBRL(position.custo_total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
