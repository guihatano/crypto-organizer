import { useExchanges } from '../hooks/useTransactions.ts'

interface ExchangeDropdownProps {
  id: string
  value: number | null
  onChange: (exchangeId: number) => void
}

/**
 * Exchange dropdown. Fetches the seeded + user-extended exchange list
 * from GET /api/exchanges (D-11).
 */
export function ExchangeDropdown({ id, value, onChange }: ExchangeDropdownProps) {
  const { data: exchanges, isLoading } = useExchanges()

  return (
    <select
      id={id}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={isLoading}
    >
      <option value="" disabled>
        {isLoading ? 'Carregando...' : 'Selecione a exchange'}
      </option>
      {exchanges?.map((exchange) => (
        <option key={exchange.id} value={exchange.id}>
          {exchange.name}
        </option>
      ))}
    </select>
  )
}
