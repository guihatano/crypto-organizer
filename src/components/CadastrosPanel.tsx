import { useState } from 'react'
import { ApiError, type Coin, type Exchange } from '../api/client.ts'
import {
  useCoins,
  useExchanges,
  useUpdateCoinGrupo08,
  useUpdateExchangeCnpj,
} from '../hooks/useTransactions.ts'

function saveErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Não foi possível salvar. Tente novamente.'
}

/**
 * One exchange row: name + inline-editable CNPJ (IR-04). Mirrors
 * ExchangeDropdown's dirty-state/save/feedback idiom — "Salvar" only
 * shows while the value differs from the fetched one, "Salvo" fades
 * after ~2s via aria-live="polite". No CNPJ format/check-digit
 * validation anywhere in this component (D-08) — a malformed or blank
 * value is always accepted.
 */
function ExchangeCnpjRow({ exchange }: { exchange: Exchange }) {
  const [value, setValue] = useState(exchange.cnpj ?? '')
  const [saved, setSaved] = useState(false)
  const mutation = useUpdateExchangeCnpj()
  const dirty = value !== (exchange.cnpj ?? '')
  const inputId = `exchange-cnpj-${exchange.id}`

  function handleSave() {
    mutation.mutate(
      { id: exchange.id, cnpj: value.trim() || null },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      },
    )
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <span className="pt-6 text-sm text-(--color-text)">{exchange.name}</span>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-xs font-medium text-(--color-text-muted)">
            CNPJ (opcional)
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            placeholder="00.000.000/0000-00"
            onChange={(e) => setValue(e.target.value)}
            className="rounded-md border border-(--color-border) px-3 py-2 text-sm"
          />
        </div>
        {dirty && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleSave}
            className="cursor-pointer rounded-md border border-(--color-border) px-2 py-1 text-xs text-(--color-text) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        )}
        <span aria-live="polite" className="text-xs text-(--color-profit)">
          {saved ? 'Salvo' : ''}
        </span>
      </div>
      {mutation.isError && <p className="w-full text-xs text-(--color-destructive)">{saveErrorMessage(mutation.error)}</p>}
    </li>
  )
}

/**
 * One coin row: symbol/name + inline-editable Grupo 08 sub-código (D-07).
 * The input is deliberately a free-text field, never a dropdown of known
 * codes — Receita Federal renumbers these between filing years.
 */
function CoinGrupo08Row({ coin }: { coin: Coin }) {
  const [value, setValue] = useState(coin.grupo08_subcodigo ?? '')
  const [saved, setSaved] = useState(false)
  const mutation = useUpdateCoinGrupo08()
  const dirty = value !== (coin.grupo08_subcodigo ?? '')
  const inputId = `coin-grupo08-${coin.id}`

  function handleSave() {
    mutation.mutate(
      { id: coin.id, grupo08_subcodigo: value.trim() || null },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      },
    )
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <span className="pt-6 text-sm text-(--color-text)">
        {coin.symbol} <span className="text-(--color-text-muted)">{coin.name}</span>
      </span>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-xs font-medium text-(--color-text-muted)">
            Sub-código Grupo 08
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            placeholder="ex: 01"
            onChange={(e) => setValue(e.target.value)}
            className="w-24 rounded-md border border-(--color-border) px-3 py-2 text-sm"
          />
        </div>
        {dirty && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={handleSave}
            className="cursor-pointer rounded-md border border-(--color-border) px-2 py-1 text-xs text-(--color-text) hover:bg-(--color-surface-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        )}
        <span aria-live="polite" className="text-xs text-(--color-profit)">
          {saved ? 'Salvo' : ''}
        </span>
      </div>
      {mutation.isError && <p className="w-full text-xs text-(--color-destructive)">{saveErrorMessage(mutation.error)}</p>}
    </li>
  )
}

/**
 * "Cadastros para declaração" — collapsible panel at the bottom of the
 * report page (D-09: no dedicated settings page). Lets the user fill each
 * exchange's CNPJ (IR-04) and each coin's Grupo 08 sub-código (D-07)
 * inline; saving invalidates ['ir-report'] (see useUpdateExchangeCnpj/
 * useUpdateCoinGrupo08) so the Discriminação text above updates with no
 * page refresh. Renders unconditionally — the user may want to fill
 * cadastros before selecting a year or even with an empty report.
 */
export function CadastrosPanel() {
  const { data: exchanges, isLoading: exchangesLoading } = useExchanges()
  const { data: coins, isLoading: coinsLoading } = useCoins()

  return (
    <details className="rounded-lg border border-(--color-border) p-4" open>
      <summary className="cursor-pointer text-base font-medium text-(--color-text)">
        Cadastros para declaração
      </summary>
      <p className="mt-1 text-sm text-(--color-text-muted)">
        Preencha o CNPJ das exchanges e o sub-código Grupo 08 de cada moeda para completar a Discriminação.
      </p>

      <div className="mt-4 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-(--color-text)">Exchanges</h3>
          {exchangesLoading && <p className="mt-2 text-sm text-(--color-text-subtle)">Carregando...</p>}
          {!exchangesLoading && (
            <ul className="mt-1 divide-y divide-(--color-border)">
              {exchanges?.map((exchange) => (
                <ExchangeCnpjRow key={exchange.id} exchange={exchange} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-(--color-text)">Moedas</h3>
          {coinsLoading && <p className="mt-2 text-sm text-(--color-text-subtle)">Carregando...</p>}
          {!coinsLoading && (
            <ul className="mt-1 divide-y divide-(--color-border)">
              {coins?.map((coin) => (
                <CoinGrupo08Row key={coin.id} coin={coin} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  )
}
