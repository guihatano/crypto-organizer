import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  apiClient,
  type Coin,
  type CreateTransactionInput,
  type CreateTransactionResponse,
  type Exchange,
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
 * Records a buy. Invalidates ['positions'] and ['transactions'] on
 * success so both tables recompute and re-render live — no page refresh
 * needed.
 */
export function useCreateBuy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiClient.post<CreateTransactionResponse>('/transactions/buy', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/**
 * Records a sell. The server re-validates chronologically before insert
 * (D-07/D-08) — an oversell rejects with a 400 the caller surfaces
 * inline. Invalidates ['positions'] and ['transactions'] on success.
 */
export function useCreateSell() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      apiClient.post<CreateTransactionResponse>('/transactions/sell', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/**
 * Edits any transaction (TX-04). Re-validated chronologically server-side
 * when editing a sell (D-12). Invalidates ['positions'] and
 * ['transactions'] on success so both tables recompute live.
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateTransactionInput }) =>
      apiClient.patch<CreateTransactionResponse>(`/transactions/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/**
 * Deletes a transaction (TX-05). Positions recompute from the remaining
 * ledger immediately (D-12).
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<{ positions: Position[] }>(`/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
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
