import { useMemo, useState } from 'react'
import { ApiError } from '../api/client.ts'
import { useCoins, useCreateCoin } from '../hooks/useTransactions.ts'

interface CoinDropdownProps {
  id: string
  value: number | null
  onChange: (coinId: number) => void
}

/**
 * Searchable coin dropdown. Fetches the seeded + user-extended coin list
 * from GET /api/coins and returns the selected coin's id (D-01). Includes
 * an inline "Adicionar moeda" action (D-02) — a new coin is immediately
 * selectable without a page refresh.
 */
export function CoinDropdown({ id, value, onChange }: CoinDropdownProps) {
  const { data: coins, isLoading } = useCoins()
  const createCoin = useCreateCoin()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [newName, setNewName] = useState('')
  const [newCoingeckoId, setNewCoingeckoId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

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

  function resetAddForm() {
    setAddingNew(false)
    setNewSymbol('')
    setNewName('')
    setNewCoingeckoId('')
    setAddError(null)
  }

  function handleCreateCoin() {
    setAddError(null)
    if (!newSymbol.trim() || !newName.trim() || !newCoingeckoId.trim()) {
      setAddError('Preencha símbolo, nome e ID do CoinGecko.')
      return
    }
    createCoin.mutate(
      { symbol: newSymbol.trim(), name: newName.trim(), coingecko_id: newCoingeckoId.trim() },
      {
        onSuccess: (coin) => {
          onChange(coin.id)
          resetAddForm()
          setOpen(false)
        },
        onError: (err) => {
          setAddError(err instanceof ApiError ? err.message : 'Erro ao adicionar moeda.')
        },
      },
    )
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        autoComplete="off"
        className="w-full rounded-md border border-[--color-border] px-3 py-2 text-sm focus:border-[--color-text-subtle] focus:outline-none"
        placeholder={isLoading ? 'Carregando...' : 'Buscar moeda (ex: BTC)'}
        value={open ? query : (selected ? `${selected.symbol} — ${selected.name}` : '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[--color-border] bg-[--color-surface] shadow-lg"
        >
          {filtered.length === 0 && !addingNew && (
            <p className="px-3 py-2 text-sm text-[--color-text-subtle]">Nenhuma moeda encontrada.</p>
          )}
          <ul>
            {filtered.map((coin) => (
              <li key={coin.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={coin.id === value}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[--color-surface-hover]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(coin.id)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <span className="font-medium">{coin.symbol}</span>{' '}
                  <span className="text-[--color-text-muted]">{coin.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-[--color-border] p-2">
            {!addingNew ? (
              <button
                type="button"
                className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm font-medium text-[--color-text] hover:bg-[--color-surface-hover]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setAddingNew(true)}
              >
                + Adicionar moeda
              </button>
            ) : (
              <div className="space-y-2" onMouseDown={(e) => e.preventDefault()}>
                <input
                  type="text"
                  placeholder="Símbolo (ex: ADA)"
                  className="w-full rounded-md border border-[--color-border] px-2 py-1 text-sm"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Nome (ex: Cardano)"
                  className="w-full rounded-md border border-[--color-border] px-2 py-1 text-sm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="CoinGecko ID (ex: cardano)"
                  className="w-full rounded-md border border-[--color-border] px-2 py-1 text-sm"
                  value={newCoingeckoId}
                  onChange={(e) => setNewCoingeckoId(e.target.value)}
                />
                {addError && <p className="text-xs text-[--color-destructive]">{addError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md px-2 py-1 text-xs text-[--color-text-muted] hover:bg-[--color-surface-hover]"
                    onClick={resetAddForm}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={createCoin.isPending}
                    className="cursor-pointer rounded-md bg-[--color-accent] px-2 py-1 text-xs text-[--color-accent-fg] hover:bg-[--color-accent-hover] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleCreateCoin}
                  >
                    {createCoin.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
