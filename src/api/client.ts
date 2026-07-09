const BASE_URL = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }

  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export interface Coin {
  id: number
  symbol: string
  name: string
  coingecko_id: string
}

export interface Exchange {
  id: number
  name: string
}

export interface Position {
  coin_id: number
  symbol: string | null
  name: string | null
  quantity: string
  preco_medio: string
  custo_total: string
}

export interface TransactionListItem {
  id: number
  date: string
  type: 'buy' | 'sell'
  coin_id: number
  coin_symbol: string
  coin_name: string
  quantity: string
  value_brl: string
  fee_brl: string
  exchange_id: number
  exchange_name: string
  origin: string
  created_at: string
}

export interface CreateTransactionInput {
  date: string
  coin_id: number
  quantity: string
  value_brl: string
  fee_brl: string
  exchange_id: number
  origin?: string
}

export interface CreateTransactionResponse {
  transaction: TransactionListItem
  positions: Position[]
}
