import type { IrReportLine } from '../api/client.ts'
import { formatBRL, formatQuantity } from '../lib/format.ts'
import { CopyDiscriminacaoButton } from './CopyDiscriminacaoButton.tsx'

interface IrExchangeLineTableProps {
  lines: IrReportLine[]
}

/**
 * One row per (coin, exchange) pair (D-05), nested under a coin group
 * header. A line with no exchange recorded renders "Exchange não
 * informada" (D-06) — never dropped, never blocking. Every row also shows
 * a muted preview of the server-generated discriminacao_text so the user
 * can verify it before copying — this component never rebuilds that
 * sentence itself.
 */
export function IrExchangeLineTable({ lines }: IrExchangeLineTableProps) {
  return (
    <table className="w-full pl-4 text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
          <th scope="col" className="py-2 pr-4 font-medium">
            Exchange
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            Quantidade
          </th>
          <th scope="col" className="py-2 pr-4 text-right font-medium">
            Custo total
          </th>
          <th scope="col" className="py-2 pr-4 font-medium" />
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.exchange_id ?? 'none'} className="border-b border-gray-100 last:border-0 align-top">
            <td className="py-2 pr-4">
              {line.exchange_name === null ? (
                <span className="text-gray-500 italic">Exchange não informada</span>
              ) : (
                <span className="text-gray-700">{line.exchange_name}</span>
              )}
              <p className="mt-1 text-xs text-gray-500">{line.discriminacao_text}</p>
            </td>
            <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
              {formatQuantity(line.quantity)}
            </td>
            <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
              {formatBRL(line.custo_de_aquisicao)}
            </td>
            <td className="py-2 pr-4">
              <CopyDiscriminacaoButton text={line.discriminacao_text} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
