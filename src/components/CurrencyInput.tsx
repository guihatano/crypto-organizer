import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client.ts'
import { Decimal } from '../lib/decimal.ts'
import {
  formatBRL,
  formatMoneyPtBR,
  maskMoneyInput,
  parseBRLInput,
  parseQuantityInput,
} from '../lib/format.ts'

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
   * Pre-fills the BRL field from a raw decimal string (e.g. edit mode
   * prefilling from an existing transaction's value_brl). Only read on
   * mount — pass a `key` on the parent element to force a remount when
   * switching which transaction is being edited.
   */
  initialBrl?: string
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
export function CurrencyInput({ id, date, initialBrl, onChangeBrl }: CurrencyInputProps) {
  const [currency, setCurrency] = useState<'BRL' | 'USDT'>('BRL')
  const [usdtAmount, setUsdtAmount] = useState('')
  const [brlDisplay, setBrlDisplay] = useState(() =>
    initialBrl ? formatMoneyPtBR(initialBrl) : '',
  )

  // Sync the initial value up to the parent once on mount (edit mode).
  // The parent forces a remount via `key` when switching which
  // transaction is being edited, so this only ever fires once per edit
  // target.
  useEffect(() => {
    if (initialBrl != null) {
      onChangeBrl(new Decimal(initialBrl).toString())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: rateData, isFetching: rateLoading } = useQuery({
    queryKey: ['rate', 'USDT', date],
    queryFn: () => apiClient.get<RateResponse>(`/rate?from=USDT&date=${date}`),
    enabled: currency === 'USDT',
    staleTime: 60_000,
  })

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

  /**
   * Live money-mask handler for user keystrokes: re-derives the pt-BR
   * display + normalized value from the input's full current string on
   * every change (see maskMoneyInput), so the field always shows
   * '100.500,00'-style formatting as the user types digits — not a
   * plain unformatted number.
   */
  function handleTypedInput(raw: string) {
    const { display, normalized } = maskMoneyInput(raw)
    setBrlDisplay(display)
    onChangeBrl(normalized)
  }

  // Auto-compute the BRL value from USDT amount * rate whenever either
  // changes, and PROPAGATE it to the parent via emitBrl (not just local
  // display state) — otherwise the parent's value_brl stays empty and
  // submission is blocked by the required-field check even though the
  // field visually shows a computed number. The user can still freely
  // overwrite the field afterward via onChange -> emitBrl; that edit
  // simply isn't overwritten again until usdtAmount or the rate change
  // once more (D-06 manual override).
  useEffect(() => {
    if (currency !== 'USDT') return
    if (!usdtAmount.trim() || rateData?.rate == null) return
    try {
      const usdt = parseQuantityInput(usdtAmount)
      const computed = usdt.times(new Decimal(rateData.rate))
      emitBrl(computed.toFixed(2).replace('.', ','))
    } catch {
      // Invalid intermediate input while typing — ignore, keep the last
      // valid BRL value so the field is never blocked.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdtAmount, rateData?.rate, currency])

  return (
    <div>
      <div className="mb-2 inline-flex rounded-md border border-(--color-border) text-xs">
        <button
          type="button"
          className={`cursor-pointer px-3 py-1 ${currency === 'BRL' ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-text-muted)'}`}
          onClick={() => setCurrency('BRL')}
        >
          BRL
        </button>
        <button
          type="button"
          className={`cursor-pointer px-3 py-1 ${currency === 'USDT' ? 'bg-(--color-accent) text-(--color-accent-fg)' : 'text-(--color-text-muted)'}`}
          onClick={() => setCurrency('USDT')}
        >
          USDT
        </button>
      </div>

      {currency === 'USDT' && (
        <div className="mb-2 space-y-1">
          <label htmlFor={`${id}-usdt`} className="block text-xs font-medium text-(--color-text-muted)">
            Valor em USDT
          </label>
          <input
            id={`${id}-usdt`}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm focus:border-(--color-text-subtle) focus:outline-none"
            value={usdtAmount}
            onChange={(e) => setUsdtAmount(e.target.value)}
          />
          <p className="text-xs text-(--color-text-subtle)">
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

      <label htmlFor={id} className="mb-1 block text-xs font-medium text-(--color-text-muted)">
        {currency === 'USDT'
          ? 'Valor em BRL (calculado — edite se necessário)'
          : 'Valor total (R$)'}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm focus:border-(--color-text-subtle) focus:outline-none"
        value={brlDisplay}
        onChange={(e) => handleTypedInput(e.target.value)}
        required
      />
    </div>
  )
}
