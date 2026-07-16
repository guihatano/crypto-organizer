/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyDiscriminacaoButton } from '../CopyDiscriminacaoButton.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CopyDiscriminacaoButton', () => {
  it('calls navigator.clipboard.writeText exactly once with the full text prop, unmodified', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const user = userEvent.setup()

    render(<CopyDiscriminacaoButton text="0.50000000 BTC (Bitcoin), adquirido(s) por R$ 100,00, custodiado(s) em Binance (CNPJ: [não informado])." />)

    await user.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      '0.50000000 BTC (Bitcoin), adquirido(s) por R$ 100,00, custodiado(s) em Binance (CNPJ: [não informado]).',
    )
  })

  it('shows "Copiado!" with the Check icon after a successful copy, and "Copiar Discriminação" with the Copy icon otherwise', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const user = userEvent.setup()

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
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CopyDiscriminacaoButton text="texto de exemplo" />)

      await user.click(screen.getByRole('button', { name: /Copiar Discriminação/ }))
      expect(screen.getByRole('button', { name: 'Copiado!' })).toBeTruthy()

      vi.advanceTimersByTime(2000)

      expect(screen.getByRole('button', { name: 'Copiar Discriminação' })).toBeTruthy()
    })
  })

  it('is never disabled — a line with missing CNPJ/exchange still copies its text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const user = userEvent.setup()

    render(
      <CopyDiscriminacaoButton text="1.00000000 ETH (Ethereum), adquirido(s) por R$ 200,00, custodiado(s) em Exchange não informada (CNPJ: [não informado])." />,
    )

    const button = screen.getByRole('button', { name: /Copiar Discriminação/ })
    expect(button.hasAttribute('disabled')).toBe(false)

    await user.click(button)
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
