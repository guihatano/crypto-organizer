/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyDiscriminacaoButton } from '../CopyDiscriminacaoButton.tsx'

/**
 * Stubs navigator.clipboard.writeText via defineProperty rather than
 * vi.stubGlobal('navigator', ...) — replacing the whole navigator object
 * strips properties (userAgent, maxTouchPoints, etc.) that
 * @testing-library/user-event's pointer/click simulation relies on,
 * silently breaking click dispatch in jsdom. MUST be called AFTER
 * userEvent.setup() — setup() attaches its own clipboard stub to the
 * view, which would otherwise overwrite this one.
 */
function stubClipboardWriteText() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return writeText
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CopyDiscriminacaoButton', () => {
  it('calls navigator.clipboard.writeText exactly once with the full text prop, unmodified', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboardWriteText()

    render(<CopyDiscriminacaoButton text="0.50000000 BTC (Bitcoin), adquirido(s) por R$ 100,00, custodiado(s) em Binance (CNPJ: [não informado])." />)

    await user.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      '0.50000000 BTC (Bitcoin), adquirido(s) por R$ 100,00, custodiado(s) em Binance (CNPJ: [não informado]).',
    )
  })

  it('shows "Copiado!" with the Check icon after a successful copy, and "Copiar Discriminação" with the Copy icon otherwise', async () => {
    const user = userEvent.setup()
    stubClipboardWriteText()

    render(<CopyDiscriminacaoButton text="texto de exemplo" />)

    expect(screen.getByRole('button', { name: 'Copiar Discriminação' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))

    expect(screen.getByRole('button', { name: 'Copiado!' })).toBeTruthy()
  })

  describe('transient confirmation window', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('reverts to the default label after the ~2s window', async () => {
      // userEvent's own internal pointer-wait Promise never settles under
      // vi.useFakeTimers() in this environment (React 19's scheduler relies
      // on macrotask timing that fake timers intercept), so this test
      // drives the click via fireEvent + act instead — fireEvent.click is
      // synchronous and RTL's act() flushes the microtask-based clipboard
      // await, letting vi.advanceTimersByTime drive the 2s revert exactly
      // as the plan specifies.
      stubClipboardWriteText()

      render(<CopyDiscriminacaoButton text="texto de exemplo" />)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))
      })
      expect(screen.getByRole('button', { name: 'Copiado!' })).toBeTruthy()

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(screen.getByRole('button', { name: 'Copiar Discriminação' })).toBeTruthy()
    })
  })

  it('shows "Não foi possível copiar" and reverts after ~2s when writeText rejects', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    render(<CopyDiscriminacaoButton text="texto de exemplo" />)

    await user.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))

    expect(screen.getByRole('button', { name: 'Não foi possível copiar' })).toBeTruthy()
  })

  it('is never disabled — a line with missing CNPJ/exchange still copies its text', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboardWriteText()

    render(
      <CopyDiscriminacaoButton text="1.00000000 ETH (Ethereum), adquirido(s) por R$ 200,00, custodiado(s) em Exchange não informada (CNPJ: [não informado])." />,
    )

    const button = screen.getByRole('button', { name: /Copiar Discriminação/ })
    expect(button.hasAttribute('disabled')).toBe(false)

    await user.click(button)
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
