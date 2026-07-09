import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client.ts'
import { Decimal } from '../lib/decimal.ts'
import { formatBRL, parseBRLInput, parseQuantityInput } from '../lib/format.ts'

interface RateResponse {
  rate: number | null
  source: 'historical' | 'current' | 'unavailable'
}

const SOURCE_LABEL: Record<RateResponse['source'], string> = {
  historical: 'cotação histórica',
  current: 'cotação atual',
  unavailable: 'cotação indisponível',
}

interface CurrencyInputProps {
  id: string
  date: string
  /**
   * Called with the resulting BRL amount already normalized to a plain
   * decimal string (e.g. "100500.00"), ready to send as `value_brl` —
   * the parent never needs to call parseBRLInput on this value.
   */
  onChangeBrl: (normalizedBrl: string) => void
}

/**
 * BRL/USDT toggle for the "Valor total" field (D-05/D-06). Defaults to
 * BRL. When USDT is selected, fetches the transaction-date rate via
 * GET /api/rate and shows the computed BRL amount — but the BRL field
 * ALWAYS stays editable, so a missing/failed rate never blocks entry.
 * Only the resulting BRL amount is ever persisted; the source currency
 * (USDT quantity, rate) is not stored (D-05).
 */
export function CurrencyInput({ id, date, onChangeBrl }: CurrencyInputProps) {
  const [currency, setCurrency] = useState<'BRL' | 'USDT'>('BRL')
  const [usdtAmount, setUsdtAmount] = useState('')
  const [brlDisplay, setBrlDisplay] = useState('')

  const { data: rateData, isFetching: rateLoading } = useQuery({
    queryKey: ['rate', 'USDT', date],
    queryFn: () => apiClient.get<RateResponse>(`/rate?from=USDT&date=${date}`),
    enabled: currency === 'USDT',
    staleTime: 60_000,
  })

  // Auto-compute the BRL display value from USDT amount * rate whenever
  // either changes. The user can still freely overwrite brlDisplay
  // afterward — that edit simply isn't overwritten again until usdtAmount
  // or the rate change once more.
  useEffect(() => {
    if (currency !== 'USDT') return
    if (!usdtAmount.trim() || rateData?.rate == null) return
    try {
      const usdt = parseQuantityInput(usdtAmount)
      const computed = usdt.times(new Decimal(rateData.rate))
      setBrlDisplay(computed.toFixed(2).replace('.', ','))
    } catch {
      // Invalid intermediate input while typing — ignore, keep the last
      // valid BRL value so the field is never blocked.
    }
  }, [usdtAmount, rateData?.rate, currency])

  function emitBrl(display: string) {
    setBrlDisplay(display)
    try {
      onChangeBrl(parseBRLInput(display).toString())
    } catch {
      // Not yet a fully valid number (e.g. user mid-typing "1,") — don't
      // propagate; the last valid normalized value stays in effect until
      // this field parses cleanly.
    }
  }

  return (
    <div>
      <div className="mb-2 inline-flex rounded-md border border-gray-300 text-xs">
        <button
          type="button"
          className={`px-3 py-1 ${currency === 'BRL' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          onClick={() => setCurrency('BRL')}
        >
          BRL
        </button>
        <button
          type="button"
          className={`px-3 py-1 ${currency === 'USDT' ? 'bg-gray-900 text-white' : 'text-gray-600'}`}
          onClick={() => setCurrency('USDT')}
        >
          USDT
        </button>
      </div>

      {currency === 'USDT' && (
        <div className="mb-2 space-y-1">
          <label htmlFor={`${id}-usdt`} className="block text-xs font-medium text-gray-500">
            Valor em USDT
          </label>
          <input
            id={`${id}-usdt`}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(e.target.value)}
          />
          <p className="text-xs text-gray-400">
            {rateLoading
              ? 'Buscando cotação...'
              : rateData
                ? rateData.rate != null
                  ? `Cotação USDT->BRL: ${formatBRL(rateData.rate)} (${SOURCE_LABEL[rateData.source]})`
                  : 'Cotação indisponível — informe o valor em BRL manualmente abaixo.'
                : ''}
          </p>
        </div>
      )}

      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-500">
        {currency === 'USDT'
          ? 'Valor em BRL (calculado — edite se necessário)'
          : 'Valor total (R$)'}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        value={brlDisplay}
        onChange={(e) => emitBrl(e.target.value)}
        required
      />
    </div>
  )
}
