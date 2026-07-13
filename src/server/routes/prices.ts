import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { coins } from '../../db/schema.ts'
import { computeSerializedPositions } from './positions.ts'
import { getBatchPrices } from '../coingecko.ts'
import { Decimal, toDecimal, ZERO } from '../../lib/decimal.ts'

export const pricesRoute = new Hono()

interface PriceRow {
  coin_id: number
  symbol: string | null
  name: string | null
  quantity: string
  preco_medio: string
  custo_total: string
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

interface PortfolioResponse {
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

pricesRoute.get('/', async (c) => {
  try {
    // Step 1: cost side (BRL, untouched) — never recomputed here.
    const positions = computeSerializedPositions()

    // Step 2: collect coingecko_id for coins with a position and fetch a
    // single batch quote (D-01, PRC-01/PRC-05).
    const coinRows = db.select().from(coins).all()
    const coinMap = new Map(coinRows.map((row) => [row.id, row]))
    const relevantCoins = positions
      .map((position) => coinMap.get(position.coin_id))
      .filter((coin): coin is NonNullable<typeof coin> => coin != null)
    const ids = [...new Set(relevantCoins.map((coin) => coin.coingeckoId))]

    let freshPrices: Record<string, { brl: number | null; usd: number | null }> = {}
    try {
      freshPrices = ids.length > 0 ? await getBatchPrices(ids) : {}
    } catch {
      // getBatchPrices already never-throws, but guard defensively so a
      // mocked/unexpected rejection can never 500 this route (D-09).
      freshPrices = {}
    }

    let gotAnyFreshQuote = false

    // Step 3: persist cache columns for coins with a fresh numeric price.
    for (const coin of relevantCoins) {
      const fresh = freshPrices[coin.coingeckoId]
      if (fresh && (typeof fresh.brl === 'number' || typeof fresh.usd === 'number')) {
        gotAnyFreshQuote = true
        const fetchedAt = new Date().toISOString()
        db.update(coins)
          .set({
            lastPriceBrl: typeof fresh.brl === 'number' ? String(fresh.brl) : coin.lastPriceBrl,
            lastPriceUsd: typeof fresh.usd === 'number' ? String(fresh.usd) : coin.lastPriceUsd,
            fetchedAt,
          })
          .where(eq(coins.id, coin.id))
          .run()
        // Keep the in-memory coinMap row in sync so step 4 below (which
        // reads coinMap, not a re-query) sees the just-persisted values.
        coin.lastPriceBrl = typeof fresh.brl === 'number' ? String(fresh.brl) : coin.lastPriceBrl
        coin.lastPriceUsd = typeof fresh.usd === 'number' ? String(fresh.usd) : coin.lastPriceUsd
        coin.fetchedAt = fetchedAt
      }
    }

    let coinsWithoutPrice = 0
    let totalInvested = ZERO
    let totalMarketValueBrl = ZERO
    let totalMarketValueUsd = ZERO
    let totalPnlBrl = ZERO
    let totalPnlUsd = ZERO
    let newestCachedFetchedAt: string | null = null

    const enrichedPositions: PriceRow[] = positions.map((position) => {
      const coin = coinMap.get(position.coin_id)
      const custoTotal = toDecimal(position.custo_total)
      totalInvested = totalInvested.plus(custoTotal)

      const fresh = coin ? freshPrices[coin.coingeckoId] : undefined
      const freshBrl = typeof fresh?.brl === 'number' ? fresh.brl : null
      const freshUsd = typeof fresh?.usd === 'number' ? fresh.usd : null

      let priceBrl: string | null = null
      let priceUsd: string | null = null
      let stale = false
      let fetchedAt: string | null = null

      // Step 4: fresh > saved-cache (stale) > unavailable (D-08/D-09).
      if (freshBrl !== null || freshUsd !== null) {
        priceBrl = freshBrl !== null ? String(freshBrl) : null
        priceUsd = freshUsd !== null ? String(freshUsd) : null
        stale = false
        fetchedAt = new Date().toISOString()
      } else if (coin?.lastPriceBrl != null || coin?.lastPriceUsd != null) {
        priceBrl = coin?.lastPriceBrl ?? null
        priceUsd = coin?.lastPriceUsd ?? null
        stale = true
        fetchedAt = coin?.fetchedAt ?? null
        if (fetchedAt && (newestCachedFetchedAt === null || fetchedAt > newestCachedFetchedAt)) {
          newestCachedFetchedAt = fetchedAt
        }
      } else {
        coinsWithoutPrice += 1
      }

      if (priceBrl === null && priceUsd === null) {
        return {
          ...position,
          price_brl: null,
          price_usd: null,
          market_value_brl: null,
          market_value_usd: null,
          pnl_brl: null,
          pnl_usd: null,
          pnl_pct: null,
          fetched_at: null,
          stale: false,
        }
      }

      // Step 5: FX BRL/USD derived from the same quote pair (D-11).
      const priceBrlDecimal = priceBrl !== null ? toDecimal(priceBrl) : null
      const priceUsdDecimal = priceUsd !== null ? toDecimal(priceUsd) : null
      const fx =
        priceBrlDecimal !== null && priceUsdDecimal !== null && !priceUsdDecimal.isZero()
          ? priceBrlDecimal.div(priceUsdDecimal)
          : null

      // Step 6: Decimal market value / P&L, with the zero-cost guard.
      const isZeroCost = custoTotal.isZero()
      const quantity = toDecimal(position.quantity)

      const marketValueBrl = priceBrlDecimal !== null ? quantity.mul(priceBrlDecimal) : null
      const marketValueUsd = priceUsdDecimal !== null ? quantity.mul(priceUsdDecimal) : null

      let pnlBrl: Decimal | null = null
      let pnlUsd: Decimal | null = null
      let pnlPct: Decimal | null = null

      if (!isZeroCost && marketValueBrl !== null) {
        pnlBrl = marketValueBrl.minus(custoTotal)
        pnlPct = marketValueBrl.div(custoTotal).minus(1)
        if (marketValueUsd !== null && fx !== null) {
          const custoUsd = custoTotal.div(fx)
          pnlUsd = marketValueUsd.minus(custoUsd)
        }
      }

      if (marketValueBrl !== null) totalMarketValueBrl = totalMarketValueBrl.plus(marketValueBrl)
      if (marketValueUsd !== null) totalMarketValueUsd = totalMarketValueUsd.plus(marketValueUsd)
      if (pnlBrl !== null) totalPnlBrl = totalPnlBrl.plus(pnlBrl)
      if (pnlUsd !== null) totalPnlUsd = totalPnlUsd.plus(pnlUsd)

      return {
        ...position,
        price_brl: priceBrl,
        price_usd: priceUsd,
        market_value_brl: marketValueBrl !== null ? marketValueBrl.toString() : null,
        market_value_usd: marketValueUsd !== null ? marketValueUsd.toString() : null,
        pnl_brl: pnlBrl !== null ? pnlBrl.toString() : null,
        pnl_usd: pnlUsd !== null ? pnlUsd.toString() : null,
        pnl_pct: pnlPct !== null ? pnlPct.toString() : null,
        fetched_at: fetchedAt,
        stale,
      }
    })

    // Step 7: aggregate totals, partial-aware (D-10).
    const totalPnlPct = totalInvested.isZero() ? null : totalPnlBrl.div(totalInvested).toString()
    const topLevelFetchedAt = gotAnyFreshQuote
      ? new Date().toISOString()
      : newestCachedFetchedAt

    const response: PortfolioResponse = {
      positions: enrichedPositions,
      total_invested_brl: totalInvested.toString(),
      total_market_value_brl: totalMarketValueBrl.toString(),
      total_market_value_usd: totalMarketValueUsd.toString(),
      total_pnl_brl: totalPnlBrl.toString(),
      total_pnl_usd: totalPnlUsd.toString(),
      total_pnl_pct: totalPnlPct,
      coins_without_price: coinsWithoutPrice,
      fetched_at: topLevelFetchedAt,
    }

    return c.json(response)
  } catch {
    // Never 500 (mirror rate.ts) — degrade to an empty/null-filled payload.
    return c.json<PortfolioResponse>({
      positions: [],
      total_invested_brl: '0',
      total_market_value_brl: '0',
      total_market_value_usd: '0',
      total_pnl_brl: '0',
      total_pnl_usd: '0',
      total_pnl_pct: null,
      coins_without_price: 0,
      fetched_at: null,
    })
  }
})
