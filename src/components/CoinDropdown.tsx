import { useMemo, useState } from 'react'
import { useCoins } from '../hooks/useTransactions.ts'

interface CoinDropdownProps {
  id: string
  value: number | null
  onChange: (coinId: number) => void
}

/**
 * Searchable coin dropdown. Fetches the seeded + user-extended coin list
 * from GET /api/coins and returns the selected coin's id (D-01).
 */
export function CoinDropdown({ id, value, onChange }: CoinDropdownProps) {
  const { data: coins, isLoading } = useCoins()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!coins) return []
    const q = query.trim().toLowerCase()
    if (!q) return coins
    return coins.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(q) || coin.name.toLowerCase().includes(q),
    )
  }, [coins, query])

  const selected = coins?.find((coin) => coin.id === value)

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        placeholder={isLoading ? 'Carregando...' : 'Buscar moeda (ex: BTC)'}
        value={open ? query : (selected ? `${selected.symbol} — ${selected.name}` : '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">Nenhuma moeda encontrada.</li>
          )}
          {filtered.map((coin) => (
            <li key={coin.id}>
              <button
                type="button"
                role="option"
                aria-selected={coin.id === value}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(coin.id)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <span className="font-medium">{coin.symbol}</span>{' '}
                <span className="text-gray-500">{coin.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
