import { Hono } from 'hono'
import { db } from '../../db/client.ts'
import { coins, exchanges, transactions } from '../../db/schema.ts'
import type { ExchangeLine } from '../../engine/irReportEngine.ts'
import { allocateByExchange } from '../../engine/irReportEngine.ts'
import { calculatePositions } from '../../engine/positionEngine.ts'
import { formatBRL, formatQuantity } from '../../lib/format.ts'
import { loadLedger } from './positions.ts'

export const irReportRoute = new Hono()

// Same BRT-calendar-day pattern as todayIso() in transactions.ts — never
// new Date().getFullYear(), which reads the server process's local/UTC
// time and can be wrong for a few hours around New Year's Eve BRT.
function currentBrtYear(): number {
  const todayBrt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  )
  return Number(todayBrt.slice(0, 4))
}

// The last fully closed BRT year — e.g. today is 2026 -> 2025 (D-02).
// Never defaults to the in-progress current year.
function lastClosedYear(): number {
  return currentBrtYear() - 1
}

// Distinct years that actually have ledger data (D-01), descending. Reads
// the year off the stored date string directly — the trade date is a
// timezone-naive calendar string and must never be parsed through a Date
// object to extract its year (Pitfall 4).
function ledgerYears(): number[] {
  const rows = db.select({ date: transactions.date }).from(transactions).all()
  const years = new Set<number>()
  for (const row of rows) {
    years.add(Number(row.date.slice(0, 4)))
  }
  return Array.from(years).sort((a, b) => b - a)
}

function formatDiscriminacao(params: {
  quantity: string
  coinSymbol: string
  coinName: string
  grupo08Subcodigo: string | null
  custoDeAquisicao: string
  exchangeName: string | null
  cnpj: string | null
}): string {
  // D-06: no exchange recorded on the underlying transaction(s).
  const exchangeName = params.exchangeName ?? 'Exchange não informada'
  // D-08: missing CNPJ never blocks generation — placeholder instead.
  const cnpj = params.cnpj ? `CNPJ: ${params.cnpj}` : 'CNPJ: [não informado]'
  // D-07: the clause is omitted entirely when the coin has no sub-código
  // set — no placeholder is authorized for this field.
  const grupo08Clause = params.grupo08Subcodigo
    ? `sub-código Grupo 08 ${params.grupo08Subcodigo}, `
    : ''

  return (
    `${formatQuantity(params.quantity)} ${params.coinSymbol} (${params.coinName}), ` +
    grupo08Clause +
    `adquirido(s) por ${formatBRL(params.custoDeAquisicao)}, ` +
    `custodiado(s) em ${exchangeName} (${cnpj}).`
  )
}

// GET /api/ir-report/years — the year selector's data source (D-01/D-02).
irReportRoute.get('/years', (c) => {
  const years = ledgerYears()
  const closed = lastClosedYear()
  const eligibleYears = years.filter((year) => year <= closed)
  const defaultYear = eligibleYears.length > 0 ? Math.max(...eligibleYears) : null

  return c.json({ years, default_year: defaultYear })
})

// GET /api/ir-report?year=YYYY — the Bens e Direitos payload. Cost/IR data
// is pure ledger replay (no external I/O) so a genuine internal fault
// surfaces as a 500 rather than degrading silently (unlike the price
// route, which deliberately tolerates a flaky external API).
irReportRoute.get('/', (c) => {
  const yearParam = c.req.query('year')
  if (!yearParam || !/^\d{4}$/.test(yearParam)) {
    return c.json({ error: 'Parâmetro year inválido — informe um ano com 4 dígitos.' }, 400)
  }
  const year = Number(yearParam)

  const years = ledgerYears()
  if (!years.includes(year)) {
    return c.json({ error: 'Não há transações registradas para o ano informado.' }, 400)
  }

  // Plain string cutoff — never routed through a Date object (Pattern 1,
  // Pitfall 4). This is the exact comparison calculatePositions() already
  // uses internally, applied again here to filter the ledger for the
  // allocator, which does not filter by date itself.
  const cutoff = `${year}-12-31`
  const ledger = loadLedger()
  const ledgerAsOfCutoff = ledger.filter((tx) => tx.date <= cutoff)

  // A coin fully sold before the cutoff has nothing to declare — omitted
  // from the report entirely (IR-01).
  const positions = calculatePositions(ledger, cutoff).filter((position) =>
    position.quantity.gt(0),
  )
  const coinPositions = new Map(positions.map((position) => [position.coinId, position]))
  const lines = allocateByExchange(ledgerAsOfCutoff, coinPositions)

  const linesByCoin = new Map<string | number, ExchangeLine[]>()
  for (const line of lines) {
    const list = linesByCoin.get(line.coinId) ?? []
    list.push(line)
    linesByCoin.set(line.coinId, list)
  }

  const coinRows = db.select().from(coins).all()
  const coinMap = new Map(coinRows.map((row) => [row.id, row]))
  const exchangeRows = db.select().from(exchanges).all()
  const exchangeMap = new Map(exchangeRows.map((row) => [row.id, row]))

  const responseCoins = positions.map((position) => {
    const coin = coinMap.get(position.coinId as number)
    const coinLines = linesByCoin.get(position.coinId) ?? []
    // IR-02/Pitfall 2: computed ONCE per coin from the aggregate custo
    // total across every exchange — never re-evaluated per line. The
    // Receita Federal rule is per asset type, not per custody location.
    const meetsThreshold = position.custoTotal.gte(5000)

    return {
      coin_id: position.coinId as number,
      symbol: coin?.symbol ?? null,
      name: coin?.name ?? null,
      grupo08_subcodigo: coin?.grupo08Subcodigo ?? null,
      quantity: position.quantity.toString(),
      preco_medio: position.precoMedio.toString(),
      custo_total: position.custoTotal.toString(),
      meets_threshold: meetsThreshold,
      lines: coinLines.map((line) => {
        const exchange =
          line.exchangeId != null ? exchangeMap.get(line.exchangeId as number) : undefined
        const exchangeName = exchange?.name ?? null
        const cnpj = exchange?.cnpj ?? null

        return {
          exchange_id: (line.exchangeId as number | null) ?? null,
          exchange_name: exchangeName,
          cnpj,
          quantity: line.quantity.toString(),
          custo_de_aquisicao: line.custoDeAquisicao.toString(),
          discriminacao_text: formatDiscriminacao({
            quantity: line.quantity.toString(),
            coinSymbol: coin?.symbol ?? '',
            coinName: coin?.name ?? '',
            grupo08Subcodigo: coin?.grupo08Subcodigo ?? null,
            custoDeAquisicao: line.custoDeAquisicao.toString(),
            exchangeName,
            cnpj,
          }),
        }
      }),
    }
  })

  return c.json({ year, coins: responseCoins })
})
