import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { stringify } from 'csv-stringify/sync'
import { db } from '../../db/client.ts'
import { coins, exchanges, transactions } from '../../db/schema.ts'

export const backupRoute = new Hono()

// Brazil is UTC-3: from ~21:00 local onward, toISOString() has already
// rolled to tomorrow's UTC date. Mirrors transactions.ts:15-17 exactly so
// the backup filename uses the same user-local calendar date.
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// Business-key pt-BR headers (D-06) — column order + labels are derived
// from this single constant, shared between export (this file) and import
// (06-02), so both sides can never drift out of sync.
const CSV_COLUMNS = [
  'data',
  'tipo',
  'moeda',
  'quantidade',
  'valor_brl',
  'taxa_brl',
  'exchange',
  'origem',
]

backupRoute.get('/export.csv', (c) => {
  const rows = db
    .select({
      date: transactions.date,
      type: transactions.type,
      coinSymbol: coins.symbol,
      quantity: transactions.quantity,
      valueBrl: transactions.valueBrl,
      feeBrl: transactions.feeBrl,
      exchangeName: exchanges.name,
      origin: transactions.origin,
    })
    .from(transactions)
    .innerJoin(coins, eq(transactions.coinId, coins.id))
    // LEFT join: exchange is optional, so a transaction without one must
    // still be exported (exchangeName comes back null -> empty cell, D-09).
    .leftJoin(exchanges, eq(transactions.exchangeId, exchanges.id))
    .orderBy(asc(transactions.date), asc(transactions.createdAt))
    .all()

  const csvRows = rows.map((row) => ({
    data: row.date, // ISO YYYY-MM-DD, D-05 — verbatim
    tipo: row.type === 'buy' ? 'compra' : 'venda', // D-07 translation
    moeda: row.coinSymbol, // business key, never coinId (BACKUP-01)
    // Raw DB TEXT verbatim — NEVER re-serialized through Decimal.js, which
    // strips trailing zeros/the decimal point (D-04):
    // new Decimal('1500.00').toString() === '1500'.
    quantidade: row.quantity,
    valor_brl: row.valueBrl,
    taxa_brl: row.feeBrl,
    exchange: row.exchangeName ?? '', // D-09: null -> empty string
    origem: row.origin, // D-08: raw, never translated
  }))

  const csv = stringify(csvRows, {
    header: true,
    columns: CSV_COLUMNS,
    delimiter: ';', // D-03
    // OWASP CSV-injection mitigation (T-06-01): prefixes cells starting
    // with =,+,-,@,tab,CR with an apostrophe before Excel/Sheets can
    // interpret them as a formula.
    escape_formulas: true,
    record_delimiter: '\n',
  })

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="backup-${todayIso()}.csv"`)
  return c.body(csv)
})
