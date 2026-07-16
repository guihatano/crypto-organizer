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
    const body: unknown = await res.json().catch(() => null)
    const message =
      (body && typeof body === 'object' && 'error' in body
        ? (body as { error?: unknown }).error
        : undefined) ?? res.statusText
    throw new ApiError(res.status, String(message))
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
  grupo08_subcodigo: string | null
}

export interface Exchange {
  id: number
  name: string
  cnpj: string | null
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
  // Exchange is optional (product decision) — a transaction can be
  // recorded without one.
  exchange_id: number | null
  exchange_name: string | null
  origin: string
  created_at: string
}

export interface CreateTransactionInput {
  date: string
  coin_id: number
  quantity: string
  value_brl: string
  fee_brl: string
  exchange_id?: number | null
  origin?: string
}

export interface CreateTransactionResponse {
  transaction: TransactionListItem
  positions: Position[]
}

// Phase 2 — market-price enrichment. Every monetary/quantity/percent value
// is serialized as a string (never number), matching the Decimal-serialized
// discipline used across the API (D-13).
export interface PriceRow extends Position {
  price_brl: string | null
  price_usd: string | null
  market_value_brl: string | null
  market_value_usd: string | null
  pnl_brl: string | null
  pnl_usd: string | null
  pnl_pct: string | null
  fetched_at: string | null
  stale: boolean
}

export interface PortfolioResponse {
  positions: PriceRow[]
  total_invested_brl: string
  total_market_value_brl: string
  total_market_value_usd: string
  total_pnl_brl: string
  total_pnl_usd: string
  total_pnl_pct: string | null
  coins_without_price: number
  fetched_at: string | null
}

// Phase 3 — Bens e Direitos IR report. Every monetary/quantity value is
// serialized as a string (D-13); meets_threshold is the only boolean.
export interface IrReportLine {
  exchange_id: number | null
  exchange_name: string | null
  cnpj: string | null
  quantity: string
  custo_de_aquisicao: string
  discriminacao_text: string
}

export interface IrReportCoin {
  coin_id: number
  symbol: string | null
  name: string | null
  grupo08_subcodigo: string | null
  quantity: string
  preco_medio: string
  custo_total: string
  meets_threshold: boolean
  lines: IrReportLine[]
}

export interface IrReportResponse {
  year: number
  coins: IrReportCoin[]
}

export interface IrReportYearsResponse {
  years: number[]
  default_year: number | null
}
