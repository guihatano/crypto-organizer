const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export interface RateResult {
  rate: number | null
  source: 'historical' | 'current' | 'unavailable'
}

function apiHeaders(): HeadersInit {
  // Reads COINGECKO_API_KEY if present, otherwise runs keyless with lower
  // rate limits — a missing key never blocks recording a transaction
  // (D-06). Uses native fetch, no axios (CLAUDE.md).
  const key = process.env.COINGECKO_API_KEY
  return key ? { 'x-cg-demo-api-key': key } : {}
}

function toDdMmYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}-${month}-${year}`
}

/**
 * Historical BRL price for a coin on a given date. Returns null on ANY
 * failure (network error, non-2xx, unexpected shape) — never throws. The
 * caller always falls back to the current rate, then to a manual
 * override.
 */
export async function getHistoricalRate(
  coingeckoId: string,
  isoDate: string,
): Promise<number | null> {
  try {
    const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/history?date=${encodeURIComponent(toDdMmYyyy(isoDate))}&localization=false`
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return null
    const data = (await res.json()) as {
      market_data?: { current_price?: { brl?: number } }
    }
    const price = data.market_data?.current_price?.brl
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

/**
 * Current BRL price for a coin. Returns null on ANY failure — never
 * throws.
 */
export async function getCurrentRate(coingeckoId: string): Promise<number | null> {
  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=brl`
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, { brl?: number } | undefined>
    const price = data[coingeckoId]?.brl
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

export interface BatchPriceResult {
  brl: number | null
  usd: number | null
}

/**
 * Batch current price (BRL + USD) for multiple coins in a single request
 * (D-01) — distinct from the single-coin BRL-only getCurrentRate above.
 * Returns null on ANY failure (network error, non-2xx, unexpected shape)
 * for EVERY requested id — never throws. A malformed/missing per-coin
 * entry in a successful response degrades to null individually (D-09)
 * without failing the whole call.
 */
export async function getBatchPrices(
  coingeckoIds: string[],
): Promise<Record<string, BatchPriceResult>> {
  const nullResult = (): Record<string, BatchPriceResult> =>
    Object.fromEntries(coingeckoIds.map((id) => [id, { brl: null, usd: null }]))

  if (coingeckoIds.length === 0) return {}

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${coingeckoIds.map(encodeURIComponent).join(',')}&vs_currencies=brl,usd`
    const res = await fetch(url, { headers: apiHeaders() })
    if (!res.ok) return nullResult()
    const data = (await res.json()) as Record<string, { brl?: number; usd?: number } | undefined>
    return Object.fromEntries(
      coingeckoIds.map((id) => {
        const entry = data[id]
        return [
          id,
          {
            brl: typeof entry?.brl === 'number' ? entry.brl : null,
            usd: typeof entry?.usd === 'number' ? entry.usd : null,
          },
        ]
      }),
    )
  } catch {
    return nullResult()
  }
}

/**
 * historical -> current -> 'unavailable' fallback chain (D-06). NEVER
 * throws in a way that blocks the caller — the client always allows a
 * manual BRL override regardless of what this returns (T-01-05).
 */
export async function getRateWithFallback(
  coingeckoId: string,
  isoDate: string,
): Promise<RateResult> {
  const historical = await getHistoricalRate(coingeckoId, isoDate)
  if (historical != null) {
    return { rate: historical, source: 'historical' }
  }

  const current = await getCurrentRate(coingeckoId)
  if (current != null) {
    return { rate: current, source: 'current' }
  }

  return { rate: null, source: 'unavailable' }
}
