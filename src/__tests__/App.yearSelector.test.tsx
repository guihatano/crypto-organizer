/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App.tsx'

/**
 * Reproduces 03-UAT test 3: after manually picking a non-default year in
 * "Relatório IR", switching to Dashboard and back must NOT silently revert
 * the selection to yearsData.default_year. Pre-fix, IrReportPage's
 * selectedYear/initialized state is component-local useState, so the
 * conditional-render view switch in App unmounts/remounts it, resetting
 * `initialized` to false and re-firing the preselect effect.
 */

const IR_REPORT_YEARS = { years: [2025, 2024, 2023], default_year: 2025 }

vi.mock('../hooks/useTransactions.ts', () => ({
  usePrices: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useTransactionsList: () => ({
    data: [{}] as unknown[],
    isLoading: false,
    isError: false,
  }),
  useIrReportYears: () => ({
    data: IR_REPORT_YEARS,
    isLoading: false,
    isError: false,
  }),
  useIrReport: (year: number | null) => ({
    data: { year, coins: [] },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../components/TransactionForm.tsx', () => ({
  TransactionForm: () => null,
}))

vi.mock('../components/CadastrosPanel.tsx', () => ({
  CadastrosPanel: () => null,
}))

afterEach(() => {
  cleanup()
})

describe('App year selector — Dashboard round-trip', () => {
  it('preserves a manually selected IR report year after switching to Dashboard and back', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Relatório IR' }))

    const yearSelect = screen.getByLabelText('Ano-calendário') as HTMLSelectElement
    expect(yearSelect.value).toBe('2025')

    await user.selectOptions(yearSelect, '2024')
    expect((screen.getByLabelText('Ano-calendário') as HTMLSelectElement).value).toBe('2024')

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Relatório IR' }))

    expect((screen.getByLabelText('Ano-calendário') as HTMLSelectElement).value).toBe('2024')
  })
})
