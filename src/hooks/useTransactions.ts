import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  apiClient,
  type Coin,
  type CreateTransactionInput,
  type CreateTransactionResponse,
  type Exchange,
  type IrReportResponse,
  type IrReportYearsResponse,
  type PortfolioResponse,
  type Position,
  type TransactionListItem,
} from '../api/client.ts'

export interface CreateCoinInput {
  symbol: string
  name: string
  coingecko_id: string
}

export interface CreateExchangeInput {
  name: string
}

export function useCoins() {
  return useQuery({
    queryKey: ['coins'],
    queryFn: () => apiClient.get<Coin[]>('/coins'),
  })
}

export function useExchanges() {
  return useQuery({
    queryKey: ['exchanges'],
    queryFn: () => apiClient.get<Exchange[]>('/exchanges'),
  })
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: () => apiClient.get<Position[]>('/positions'),
  })
}

export function useTransactionsList() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () => apiClient.get<TransactionListItem[]>('/transactions'),
  })
}

/**
 * Market-price enrichment (D-02): auto-refreshes every 60s so the
 * dashboard's market value/P&L stay live without user action. staleTime
 * is already 60_000 globally (src/main.tsx). A manual refresh button
 * calls this hook's own `refetch()` (or invalidateQueries(['prices'])).
 * The route never throws — degraded/partial payloads come back as normal
 * `data`, not `isError`.
 */
export function usePrices() {
  return useQuery({
    queryKey: ['prices'],
    queryFn: () => apiClient.get<PortfolioResponse>('/prices'),
    refetchInterval: 60_000,
  })
}

/**
 * Records a buy. Invalidates ['positions'], ['prices'], ['transactions'],
 * ['ir-report'] and ['ir-report-years'] on success so the dashboard
 * (usePrices-driven since 02-02), the raw positions query, the history
 * table, and the Relatório IR view all recompute and re-render live — no
 * page refresh needed.
 */
export function useCreateBuy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiClient.post<CreateTransactionResponse>('/transactions/buy', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['prices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report-years'] })
    },
  })
}

/**
 * Records a sell. The server re-validates chronologically before insert
 * (D-07/D-08) — an oversell rejects with a 400 the caller surfaces
 * inline. Invalidates ['positions'], ['prices'], ['transactions'],
 * ['ir-report'] and ['ir-report-years'] on success.
 */
export function useCreateSell() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiClient.post<CreateTransactionResponse>('/transactions/sell', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['prices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report-years'] })
    },
  })
}

/**
 * Edits any transaction (TX-04). Re-validated chronologically server-side
 * when editing a sell (D-12). Invalidates ['positions'], ['prices'],
 * ['transactions'], ['ir-report'] and ['ir-report-years'] on success so
 * all views recompute live.
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTransactionInput }) =>
      apiClient.patch<CreateTransactionResponse>(`/transactions/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['prices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report-years'] })
    },
  })
}

/**
 * Deletes a transaction (TX-05). Positions recompute from the remaining
 * ledger immediately (D-12); ['prices'], ['ir-report'] and
 * ['ir-report-years'] are also invalidated so the dashboard's market
 * value/P&L and the Relatório IR view reflect the updated ledger right
 * away.
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<{ positions: Position[] }>(`/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['prices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report-years'] })
    },
  })
}

/**
 * Adds a user coin (D-02). Invalidates ['coins'] so it's immediately
 * selectable in CoinDropdown without a refresh.
 */
export function useCreateCoin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCoinInput) => apiClient.post<Coin>('/coins', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coins'] })
    },
  })
}

/**
 * Adds a user exchange (D-11). Invalidates ['exchanges'] so it's
 * immediately selectable in ExchangeDropdown without a refresh.
 */
export function useCreateExchange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateExchangeInput) => apiClient.post<Exchange>('/exchanges', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchanges'] })
    },
  })
}

/**
 * Saves an exchange's CNPJ (IR-04, Cadastros panel). Invalidates
 * ['exchanges'] AND ['ir-report'] on success — the second invalidation is
 * what makes a just-saved CNPJ appear in the Discriminação text with no
 * page refresh.
 */
export function useUpdateExchangeCnpj() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, cnpj }: { id: number; cnpj: string | null }) =>
      apiClient.patch<Exchange>(`/exchanges/${id}`, { cnpj }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchanges'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
    },
  })
}

/**
 * Saves a coin's Grupo 08 sub-código (D-07, Cadastros panel). Invalidates
 * ['coins'] AND ['ir-report'] on success, mirroring
 * useUpdateExchangeCnpj's shape.
 */
export function useUpdateCoinGrupo08() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, grupo08_subcodigo }: { id: number; grupo08_subcodigo: string | null }) =>
      apiClient.patch<Coin>(`/coins/${id}`, { grupo08_subcodigo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coins'] })
      queryClient.invalidateQueries({ queryKey: ['ir-report'] })
    },
  })
}

/**
 * Distinct ledger years (D-01) plus the last closed BRT year as
 * default_year (D-02, null when the ledger has no closed year yet). No
 * refetchInterval — unlike usePrices, this is ledger-derived and only
 * changes on a mutation, not on a 60s market clock.
 */
export function useIrReportYears() {
  return useQuery({
    queryKey: ['ir-report-years'],
    queryFn: () => apiClient.get<IrReportYearsResponse>('/ir-report/years'),
  })
}

/**
 * Bens e Direitos report for a single closed year (IR-01). Disabled while
 * no year is selected (year === null) so it never fires with an invalid
 * query param.
 */
export function useIrReport(year: number | null) {
  return useQuery({
    queryKey: ['ir-report', year],
    queryFn: () => apiClient.get<IrReportResponse>(`/ir-report?year=${year}`),
    enabled: year !== null,
  })
}
