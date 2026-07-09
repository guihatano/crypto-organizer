import { useState } from 'react'
import { ApiError } from '../api/client.ts'
import { useCreateExchange, useExchanges } from '../hooks/useTransactions.ts'

interface ExchangeDropdownProps {
  id: string
  value: number | null
  onChange: (exchangeId: number) => void
}

/**
 * Exchange dropdown. Fetches the seeded + user-extended exchange list
 * from GET /api/exchanges (D-11). Includes an inline "Adicionar exchange"
 * action — a new exchange is immediately selectable without a refresh.
 */
export function ExchangeDropdown({ id, value, onChange }: ExchangeDropdownProps) {
  const { data: exchanges, isLoading } = useExchanges()
  const createExchange = useCreateExchange()
  const [open, setOpen] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const selected = exchanges?.find((exchange) => exchange.id === value)

  function resetAddForm() {
    setAddingNew(false)
    setNewName('')
    setAddError(null)
  }

  function handleCreateExchange() {
    setAddError(null)
    if (!newName.trim()) {
      setAddError('Informe o nome da exchange.')
      return
    }
    createExchange.mutate(
      { name: newName.trim() },
      {
        onSuccess: (exchange) => {
          onChange(exchange.id)
          resetAddForm()
          setOpen(false)
        },
        onError: (err) => {
          setAddError(err instanceof ApiError ? err.message : 'Erro ao adicionar exchange.')
        },
      },
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-left text-sm focus:border-gray-500 focus:outline-none"
        onClick={() => setOpen((o) => !o)}
      >
        {isLoading ? 'Carregando...' : (selected?.name ?? 'Selecione a exchange')}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          <ul>
            {exchanges?.map((exchange) => (
              <li key={exchange.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                  onClick={() => {
                    onChange(exchange.id)
                    setOpen(false)
                  }}
                >
                  {exchange.name}
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-200 p-2">
            {!addingNew ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setAddingNew(true)}
              >
                + Adicionar exchange
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nome (ex: OKX)"
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                {addError && <p className="text-xs text-red-600">{addError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={resetAddForm}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={createExchange.isPending}
                    className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                    onClick={handleCreateExchange}
                  >
                    {createExchange.isPending ? 'Salvando...' : 'Salvar'}
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
