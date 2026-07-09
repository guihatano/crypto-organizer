import { useEffect, useRef, useState } from 'react'
import { ApiError, type TransactionListItem } from '../api/client.ts'
import { formatQuantity, parseBRLInput, parseQuantityInput } from '../lib/format.ts'
import { useCreateBuy, useCreateSell, useUpdateTransaction } from '../hooks/useTransactions.ts'
import { CoinDropdown } from './CoinDropdown.tsx'
import { ExchangeDropdown } from './ExchangeDropdown.tsx'
import { CurrencyInput } from './CurrencyInput.tsx'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  /** When set, the form opens prefilled in edit mode and submits via PATCH. */
  editingTransaction?: TransactionListItem | null
}

type Mode = 'buy' | 'sell'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const MODE_LABEL: Record<Mode, string> = { buy: 'Compra', sell: 'Venda' }

/**
 * Modal transaction entry form (D-03) with a Compra/Venda toggle for new
 * transactions. Buy mode uses CurrencyInput (BRL/USDT toggle, D-05/D-06);
 * sell mode's "Valor recebido" is inert for Phase 1 math but stored for a
 * future capital-gains phase. When `editingTransaction` is set, the form
 * is prefilled and submits via PATCH instead of POST (TX-04) — the
 * buy/sell type cannot be changed on an existing transaction, so the
 * toggle is replaced by a static label.
 */
export function TransactionForm({ open, onClose, editingTransaction }: TransactionFormProps) {
  const [mode, setMode] = useState<Mode>('buy')
  const [date, setDate] = useState(todayIso())
  const [coinId, setCoinId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [valueBrl, setValueBrl] = useState('')
  const [receivedBrl, setReceivedBrl] = useState('')
  const [feeBrl, setFeeBrl] = useState('')
  const [exchangeId, setExchangeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createBuy = useCreateBuy()
  const createSell = useCreateSell()
  const updateTransaction = useUpdateTransaction()
  const isPending = createBuy.isPending || createSell.isPending || updateTransaction.isPending
  const dateInputRef = useRef<HTMLInputElement>(null)
  const isEditing = editingTransaction != null

  useEffect(() => {
    if (!open) return

    if (editingTransaction) {
      setMode(editingTransaction.type)
      setDate(editingTransaction.date)
      setCoinId(editingTransaction.coin_id)
      setQuantity(formatQuantity(editingTransaction.quantity))
      setFeeBrl(formatQuantity(editingTransaction.fee_brl))
      setExchangeId(editingTransaction.exchange_id)
      if (editingTransaction.type === 'buy') {
        setValueBrl(editingTransaction.value_brl)
        setReceivedBrl('')
      } else {
        setReceivedBrl(formatQuantity(editingTransaction.value_brl))
        setValueBrl('')
      }
    } else {
      setMode('buy')
      setDate(todayIso())
      setCoinId(null)
      setQuantity('')
      setValueBrl('')
      setReceivedBrl('')
      setFeeBrl('')
      setExchangeId(null)
    }
    setError(null)

    dateInputRef.current?.focus()
  }, [open, editingTransaction])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

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
    if (!quantity.trim()) {
      setError('Preencha a quantidade.')
      return
    }

    const quantityDecimal = parseQuantityInput(quantity)
    const feeDecimal = parseBRLInput(feeBrl || '0')
    const isBuy = mode === 'buy'

    if (isBuy && !valueBrl.trim()) {
      setError('Preencha o valor total.')
      return
    }

    const valueForApi = isBuy ? valueBrl : parseBRLInput(receivedBrl || '0').toString()

    const input = {
      date,
      coin_id: coinId,
      quantity: quantityDecimal.toString(),
      value_brl: valueForApi,
      fee_brl: feeDecimal.toString(),
      exchange_id: exchangeId,
    }

    const handlers = {
      onSuccess: () => onClose(),
      onError: (err: unknown) => {
        // D-07: the server rejects an oversell with a clear reason —
        // surfaced inline below the quantity field.
        setError(err instanceof ApiError ? err.message : 'Erro ao registrar transação.')
      },
    }

    if (isEditing && editingTransaction) {
      updateTransaction.mutate({ id: editingTransaction.id, input }, handlers)
    } else if (isBuy) {
      createBuy.mutate(input, handlers)
    } else {
      createSell.mutate(input, handlers)
    }
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
          {isEditing ? 'Editar transação' : 'Nova transação'}
        </h2>

        {isEditing ? (
          <p className="mb-4 inline-block rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {MODE_LABEL[mode]}
          </p>
        ) : (
          <div
            role="tablist"
            aria-label="Tipo de transação"
            className="mb-4 inline-flex rounded-md border border-gray-300 text-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'buy'}
              className={`px-4 py-1.5 ${mode === 'buy' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
              onClick={() => setMode('buy')}
            >
              Compra
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'sell'}
              className={`px-4 py-1.5 ${mode === 'sell' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
              onClick={() => setMode('sell')}
            >
              Venda
            </button>
          </div>
        )}

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
            {error && (
              <p role="alert" className="mt-1 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>

          {mode === 'buy' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <CurrencyInput
                  key={editingTransaction?.id ?? 'new'}
                  id="tx-value"
                  date={date}
                  initialBrl={isEditing ? valueBrl : undefined}
                  onChangeBrl={setValueBrl}
                />
              </div>
              <div>
                <label
                  htmlFor="tx-fee"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
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
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="tx-received"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Valor recebido (R$)
                </label>
                <input
                  id="tx-received"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
                  value={receivedBrl}
                  onChange={(e) => setReceivedBrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Guardado para uma futura declaração de ganho de capital — não
                  afeta o preço médio nem o custo de aquisição.
                </p>
              </div>
              <div>
                <label
                  htmlFor="tx-fee"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
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
          )}

          <div>
            <label
              htmlFor="tx-exchange"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Exchange
            </label>
            <ExchangeDropdown id="tx-exchange" value={exchangeId} onChange={setExchangeId} />
          </div>

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
              disabled={isPending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
