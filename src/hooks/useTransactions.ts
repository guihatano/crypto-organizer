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
