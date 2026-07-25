/** @vitest-environment jsdom */
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CurrencyInput } from '../CurrencyInput.tsx'

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CurrencyInput — USDT auto-calc wiring (regression for missing onChangeBrl propagation)', () => {
  it('propagates the computed BRL amount to onChangeBrl when USDT + rate resolve, and still allows manual override', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rate: 5.5, source: 'historical' }),
      }),
    )

    const onChangeBrl = vi.fn()
    const user = userEvent.setup()

    renderWithClient(
      <CurrencyInput id="tx-value" date="2026-07-01" onChangeBrl={onChangeBrl} />,
    )

    await user.click(screen.getByRole('button', { name: 'USDT' }))
    await user.type(screen.getByLabelText('Valor em USDT'), '100')

    // The BRL field must be auto-populated with the computed amount
    // (100 USDT * 5.5 = 550.00) AND that value must be propagated to the
    // parent via onChangeBrl — not just held in local display state.
    await waitFor(() => {
      expect(onChangeBrl).toHaveBeenCalledWith('550')
    })

    const brlInput = screen.getByLabelText(/Valor em BRL/) as HTMLInputElement
    expect(brlInput.value).toBe('550,00')

    // Manual override must still work afterward (D-06).
    onChangeBrl.mockClear()
    await user.clear(brlInput)
    await user.type(brlInput, '600,00')
    expect(onChangeBrl).toHaveBeenLastCalledWith('600')
  })

  it('never blocks the field when the rate is unavailable — manual entry still propagates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rate: null, source: 'unavailable' }),
      }),
    )

    const onChangeBrl = vi.fn()
    const user = userEvent.setup()

    renderWithClient(
      <CurrencyInput id="tx-value" date="2026-07-01" onChangeBrl={onChangeBrl} />,
    )

    await user.click(screen.getByRole('button', { name: 'USDT' }))
    await user.type(screen.getByLabelText('Valor em USDT'), '100')

    // getByText throws (and waitFor retries) until the text is present —
    // no jest-dom matcher needed for a plain presence check.
    await waitFor(() => {
      screen.getByText(/Cotação indisponível/)
    })

    const brlInput = screen.getByLabelText(/Valor em BRL/)
    await user.type(brlInput, '999,90')
    expect(onChangeBrl).toHaveBeenLastCalledWith('999.9')
  })
})

describe('CurrencyInput — edit-mode prefill (regression for blank-screen crash)', () => {
  it('does not crash when initialBrl is an empty string (stale prefill on first edit render)', () => {
    const onChangeBrl = vi.fn()
    // new Decimal('') throws; with no error boundary above, an uncaught throw
    // here blanked the entire app when editing a buy transaction.
    expect(() =>
      renderWithClient(
        <CurrencyInput id="tx-value" date="2026-07-01" initialBrl="" onChangeBrl={onChangeBrl} />,
      ),
    ).not.toThrow()
    const brlInput = screen.getByLabelText(/Valor total/) as HTMLInputElement
    expect(brlInput.value).toBe('')
    expect(onChangeBrl).not.toHaveBeenCalled()
  })

  it('prefills the BRL display and emits the normalized value from a valid initialBrl', () => {
    const onChangeBrl = vi.fn()
    renderWithClient(
      <CurrencyInput id="tx-value" date="2026-07-01" initialBrl="1500.00" onChangeBrl={onChangeBrl} />,
    )
    const brlInput = screen.getByLabelText(/Valor total/) as HTMLInputElement
    expect(brlInput.value).toBe('1.500,00')
    expect(onChangeBrl).toHaveBeenCalledWith('1500')
  })
})
