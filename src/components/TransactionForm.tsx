import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.ts'
import { parseBRLInput, parseQuantityInput } from '../lib/format.ts'
import { useCreateBuy } from '../hooks/useTransactions.ts'
import { CoinDropdown } from './CoinDropdown.tsx'
import { ExchangeDropdown } from './ExchangeDropdown.tsx'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Modal transaction entry form (D-03). Buy mode only for Wave 1 — sell
 * mode (Compra/Venda toggle) is added in Wave 2.
 */
export function TransactionForm({ open, onClose }: TransactionFormProps) {
  const [date, setDate] = useState(todayIso())
  const [coinId, setCoinId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [valueBrl, setValueBrl] = useState('')
  const [feeBrl, setFeeBrl] = useState('')
  const [exchangeId, setExchangeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createBuy = useCreateBuy()
  const dateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      dateInputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  function resetForm() {
    setDate(todayIso())
    setCoinId(null)
    setQuantity('')
    setValueBrl('')
    setFeeBrl('')
    setExchangeId(null)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!coinId) {
      setError('Selecione a moeda.')
      return
    }
    if (!exchangeId) {
      setError('Selecione a exchange.')
      return
    }
    if (!quantity.trim() || !valueBrl.trim()) {
      setError('Preencha quantidade e valor total.')
      return
    }

    const quantityDecimal = parseQuantityInput(quantity)
    const valueDecimal = parseBRLInput(valueBrl)
    const feeDecimal = parseBRLInput(feeBrl || '0')

    createBuy.mutate(
      {
        date,
        coin_id: coinId,
        quantity: quantityDecimal.toString(),
        value_brl: valueDecimal.toString(),
        fee_brl: feeDecimal.toString(),
        exchange_id: exchangeId,
      },
      {
        onSuccess: () => {
          resetForm()
          onClose()
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Erro ao registrar transação.')
        },
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="transaction-form-title" className="mb-4 text-lg font-semibold text-gray-900">
          Nova transação
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tx-date" className="mb-1 block text-sm font-medium text-gray-700">
              Data
            </label>
            <input
              ref={dateInputRef}
              id="tx-date"
              type="date"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="tx-coin" className="mb-1 block text-sm font-medium text-gray-700">
              Moeda
            </label>
            <CoinDropdown id="tx-coin" value={coinId} onChange={setCoinId} />
          </div>

          <div>
            <label
              htmlFor="tx-quantity"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Quantidade
            </label>
            <input
              id="tx-quantity"
              type="text"
              inputMode="decimal"
              placeholder="0,00000000"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="tx-value"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Valor total (R$)
              </label>
              <input
                id="tx-value"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                value={valueBrl}
                onChange={(e) => setValueBrl(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="tx-fee" className="mb-1 block text-sm font-medium text-gray-700">
                Taxa (R$)
              </label>
              <input
                id="tx-fee"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                value={feeBrl}
                onChange={(e) => setFeeBrl(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="tx-exchange"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Exchange
            </label>
            <ExchangeDropdown id="tx-exchange" value={exchangeId} onChange={setExchangeId} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createBuy.isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {createBuy.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
