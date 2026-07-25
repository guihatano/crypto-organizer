import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { stringify } from 'csv-stringify/sync'
import { parse } from 'csv-parse/sync'
import { db } from '../../db/client.ts'
import { coins, exchanges, transactions } from '../../db/schema.ts'
import { toDecimal } from '../../lib/decimal.ts'
import { validateImportBatch, type ImportBatchCandidate } from '../../engine/validation.ts'
import type { Transaction as EngineTransaction } from '../../engine/types.ts'

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
    moeda: escapeLeadingApostrophe(row.coinSymbol), // business key, never coinId (BACKUP-01)
    // Raw DB TEXT verbatim — NEVER re-serialized through Decimal.js, which
    // strips trailing zeros/the decimal point (D-04):
    // new Decimal('1500.00').toString() === '1500'.
    quantidade: row.quantity,
    valor_brl: row.valueBrl,
    taxa_brl: row.feeBrl,
    exchange: escapeLeadingApostrophe(row.exchangeName ?? ''), // D-09: null -> empty string
    origem: escapeLeadingApostrophe(row.origin), // D-08: raw, never translated
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

// [ASSUMED] (RESEARCH.md A1): no OWASP-specific number applies to a
// single-user local app; 5 MB comfortably covers years of manually-entered
// transactions while still preventing a pathological upload from
// ballooning memory, since csv-parse/sync buffers the whole file.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

const TIPO_IMPORT: Record<string, 'buy' | 'sell'> = { compra: 'buy', venda: 'sell' }

// csv-stringify's escape_formulas prefixes any cell starting with one of
// these characters with a leading apostrophe (OWASP CSV-injection rule).
// csv-parse has no symmetric un-escaping, so a re-imported cell must be
// manually un-prefixed before use as a business key, or repeated
// export->import cycles silently mint duplicate exchanges (RESEARCH.md
// Pitfall 1). Applied to every unescaped business-key cell — `moeda`,
// `exchange` and `origem` — mirroring escape_formulas, which is
// stringifier-wide (every column), so decode stays symmetric with encode.
const FORMULA_PREFIX_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

// Inverse of escapeLeadingApostrophe (below), applied on import. A leading
// apostrophe is stripped in exactly two lossless cases so a genuine name
// that itself starts with "'" round-trips distinctly from the OWASP escape
// marker (WR-01):
//   - `''X`  -> `'X`   (our doubled-apostrophe encoding of a real leading ')
//   - `'=X`  -> `=X`   (escape_formulas' OWASP prefix; ' + a trigger char)
// A single leading apostrophe followed by any other char is a genuine name
// and is left untouched.
function unescapeFormulaPrefix(cell: string): string {
  if (cell.length > 1 && cell[0] === "'" && (cell[1] === "'" || FORMULA_PREFIX_TRIGGERS.has(cell[1]))) {
    return cell.slice(1)
  }
  return cell
}

// Export-side counterpart to unescapeFormulaPrefix. escape_formulas only
// guards cells that START with a trigger char; a business-key name that
// genuinely begins with "'" would pass through verbatim and then be
// mis-stripped on reimport, silently renaming an exchange and splitting its
// history. Doubling the leading apostrophe makes that case round-trip
// distinctly from the OWASP escape marker (WR-01).
function escapeLeadingApostrophe(cell: string): string {
  return cell.startsWith("'") ? "'" + cell : cell
}

function findCoinIdBySymbol(symbol: string): number | null {
  const row = db.select({ id: coins.id }).from(coins).where(eq(coins.symbol, symbol)).get()
  return row?.id ?? null
}

function findExchangeIdByName(name: string): number | null {
  const row = db
    .select({ id: exchanges.id })
    .from(exchanges)
    .where(eq(exchanges.name, name))
    .get()
  return row?.id ?? null
}

interface ImportRowError {
  line: number
  reason: string
}

interface ValidatedImportRow {
  line: number
  date: string
  type: 'buy' | 'sell'
  coinId: number
  quantity: string
  valueBrl: string
  feeBrl: string
  // null = no exchange (D-09). Non-null = the (unescaped) exchange name;
  // exchangeId is its resolved existing id, or null when the name needs
  // to be auto-created (D-01/D-02) inside the write transaction.
  exchangeName: string | null
  exchangeId: number | null
  // Raw `origem` CSV cell — part of the dedupe business key (D-08) as-is,
  // NEVER what actually gets stored (storage always forces 'csv-import',
  // BACKUP-05) — see buildDedupeKey below.
  origin: string
}

/**
 * The 8-field business key (date, type, coin, quantity, value, fee,
 * exchange, origin), decimal-normalized on the three numeric fields so a
 * hand-edited/re-saved CSV cell like "1500.00" still dedupes against a
 * stored "1500" (Pitfall 4).
 *
 * The exchange dimension is three-way, NOT just id-or-null: an unresolved
 * (null) exchangeId is ambiguous between a genuine no-exchange row (D-09)
 * and a row naming a brand-new exchange whose id is only assigned inside
 * the write transaction. The pending case is keyed on `pending:<name>` so
 * those two cases — and two distinct pending names in the same batch —
 * never collapse to the same key and silently drop a legitimate row.
 */
function buildDedupeKey(row: {
  date: string
  type: string
  coinId: number
  quantity: string
  valueBrl: string
  feeBrl: string
  exchangeId: number | null
  // Only meaningful when exchangeId is null (pending auto-create). Existing
  // DB rows pass null here — a null exchangeId there is always genuine D-09.
  exchangeName?: string | null
  origin: string
}): string {
  const exchangeKeyPart =
    row.exchangeId != null
      ? String(row.exchangeId)
      : row.exchangeName
        ? `pending:${row.exchangeName}`
        : 'null'

  return [
    row.date,
    row.type,
    row.coinId,
    toDecimal(row.quantity).toString(),
    toDecimal(row.valueBrl).toString(),
    toDecimal(row.feeBrl).toString(),
    exchangeKeyPart,
    row.origin,
  ].join('|')
}

backupRoute.post('/import', async (c) => {
  const formData = await c.req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'Nenhum arquivo enviado.' }, 400)
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return c.json({ error: 'Arquivo muito grande.' }, 400)
  }

  const fileText = await file.text()

  let records: Record<string, string>[]
  try {
    records = parse(fileText, {
      delimiter: ';',
      columns: true,
      trim: true,
      skip_empty_lines: true,
      // STRICT: any ragged row throws -> a single "malformed file" message,
      // never a per-row list (business-rule errors are a separate path).
      relax_column_count: false,
      bom: true,
    })
  } catch {
    return c.json(
      {
        error:
          'Não foi possível ler o arquivo. Confira se é um CSV exportado por este app (colunas e separador ";" no formato esperado).',
      },
      400,
    )
  }

  // Per-row PURE business validation — no DB writes yet. Line numbers are
  // handler-computed (index + 2, header is line 1); csv-parse's own error
  // positions only cover structural failures, not business rules
  // (RESEARCH.md "Why not rely on csv-parse's own line numbers").
  const rowErrors: ImportRowError[] = []
  const validRows: ValidatedImportRow[] = []

  records.forEach((record, index) => {
    const line = index + 2

    const tipoRaw = (record.tipo ?? '').trim()
    const type = TIPO_IMPORT[tipoRaw]
    if (!type) {
      rowErrors.push({ line, reason: `Tipo inválido: "${tipoRaw}".` })
      return
    }

    const moedaRaw = unescapeFormulaPrefix((record.moeda ?? '').trim())
    const coinId = findCoinIdBySymbol(moedaRaw)
    if (coinId == null) {
      // D-01: unknown coin is REJECTED, never auto-created — coins.coingecko_id
      // is NOT NULL and the CSV carries no coingecko_id.
      rowErrors.push({ line, reason: `Moeda "${moedaRaw}" não cadastrada.` })
      return
    }

    const exchangeCellRaw = unescapeFormulaPrefix((record.exchange ?? '').trim())
    let exchangeName: string | null = null
    let exchangeId: number | null = null
    if (exchangeCellRaw !== '') {
      exchangeName = exchangeCellRaw
      exchangeId = findExchangeIdByName(exchangeCellRaw) // null -> flagged for auto-create below
    }

    const date = (record.data ?? '').trim()
    if (!date) {
      rowErrors.push({ line, reason: 'Data ausente.' })
      return
    }

    const quantity = (record.quantidade ?? '').trim()
    const valueBrl = (record.valor_brl ?? '').trim()
    const feeBrl = (record.taxa_brl ?? '').trim()
    // Unescaped like moeda/exchange: escape_formulas on export is
    // stringifier-wide (every cell, origem included), so a future origin
    // value starting with a trigger char would otherwise carry a stray
    // leading apostrophe into the dedupe key and break round-trip dedup.
    const origin = unescapeFormulaPrefix((record.origem ?? '').trim())

    let qtyDecimal
    try {
      qtyDecimal = toDecimal(quantity)
    } catch {
      rowErrors.push({ line, reason: 'Quantidade inválida.' })
      return
    }
    if (!qtyDecimal.gt(0)) {
      rowErrors.push({ line, reason: 'A quantidade deve ser maior que zero.' })
      return
    }

    let valueDecimal
    let feeDecimal
    try {
      valueDecimal = toDecimal(valueBrl)
      feeDecimal = toDecimal(feeBrl)
    } catch {
      rowErrors.push({ line, reason: 'Valor ou taxa inválidos.' })
      return
    }
    if (valueDecimal.lt(0) || feeDecimal.lt(0)) {
      rowErrors.push({ line, reason: 'Valor e taxa não podem ser negativos.' })
      return
    }

    validRows.push({
      line,
      date,
      type,
      coinId,
      // Raw cell strings, kept verbatim for storage — NEVER
      // toDecimal(...).toString() (Pitfall 3: strips trailing zeros / the
      // decimal point, e.g. new Decimal('1500.00').toString() === '1500').
      quantity,
      valueBrl,
      feeBrl,
      exchangeName,
      exchangeId,
      origin,
    })
  })

  if (rowErrors.length > 0) {
    // BACKUP-04: any per-row rejection blocks the whole batch. Nothing
    // written — we haven't touched the DB at all yet.
    return c.json({ errors: rowErrors }, 400)
  }

  // Dedupe (BACKUP-03) against every existing row, decimal-normalized
  // (Pitfall 4) and null-exchange-safe (D-09). existingByCoin doubles as
  // the ledger validateImportBatch replays against below.
  const existingRows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      coinId: transactions.coinId,
      quantity: transactions.quantity,
      valueBrl: transactions.valueBrl,
      feeBrl: transactions.feeBrl,
      exchangeId: transactions.exchangeId,
      origin: transactions.origin,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .all()

  const existingKeys = new Set<string>()
  const existingByCoin = new Map<number, EngineTransaction[]>()
  for (const row of existingRows) {
    existingKeys.add(
      buildDedupeKey({
        date: row.date,
        type: row.type,
        coinId: row.coinId,
        quantity: row.quantity,
        valueBrl: row.valueBrl,
        feeBrl: row.feeBrl,
        exchangeId: row.exchangeId,
        origin: row.origin,
      }),
    )
    const list = existingByCoin.get(row.coinId) ?? []
    list.push({
      id: row.id,
      date: row.date,
      type: row.type,
      coinId: row.coinId,
      quantity: row.quantity,
      valueBrl: row.valueBrl,
      feeBrl: row.feeBrl,
      createdAt: row.createdAt,
    })
    existingByCoin.set(row.coinId, list)
  }

  const batchKeys = new Set<string>()
  const rowsToInsert: ValidatedImportRow[] = []
  let duplicatesSkipped = 0

  for (const row of validRows) {
    const key = buildDedupeKey({
      date: row.date,
      type: row.type,
      coinId: row.coinId,
      quantity: row.quantity,
      valueBrl: row.valueBrl,
      feeBrl: row.feeBrl,
      exchangeId: row.exchangeId,
      exchangeName: row.exchangeName,
      origin: row.origin,
    })
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicatesSkipped += 1
      continue
    }
    batchKeys.add(key)
    rowsToInsert.push(row)
  }

  // Batch negative-position guard (BACKUP-04, T-06-06) — runs over ONLY
  // the non-duplicate rows, since duplicates are never inserted and can't
  // move any position.
  const batchByCoin = new Map<number, ImportBatchCandidate[]>()
  for (const row of rowsToInsert) {
    const list = batchByCoin.get(row.coinId) ?? []
    list.push({ line: row.line, date: row.date, type: row.type, quantity: row.quantity })
    batchByCoin.set(row.coinId, list)
  }

  const negativeViolation = validateImportBatch(batchByCoin, existingByCoin)
  if (negativeViolation) {
    return c.json({ errors: [negativeViolation] }, 400)
  }

  // Unknown exchange names (D-01) are auto-created silently (D-02) inside
  // the write transaction below; deduped by name so a name appearing on
  // multiple rows in this batch is only created once.
  const pendingExchangeNames = [
    ...new Set(
      rowsToInsert
        .filter((row): row is ValidatedImportRow & { exchangeName: string } =>
          row.exchangeName != null && row.exchangeId == null,
        )
        .map((row) => row.exchangeName),
    ),
  ]

  const now = new Date().toISOString()

  // CRITICAL: this callback is 100% synchronous — no `await` anywhere
  // inside (Pitfall 2). All async work (formData/file.text()) and all
  // per-row validation/FK-resolution/dedupe computation already happened
  // above. Drizzle's better-sqlite3 driver runs this via
  // better-sqlite3's own synchronous Database.transaction(), which
  // automatically rolls back on any thrown exception — no explicit
  // rollback call needed.
  db.transaction((tx) => {
    const createdExchangeIds = new Map<string, number>()
    for (const name of pendingExchangeNames) {
      const inserted = tx
        .insert(exchanges)
        .values({ name, createdAt: now, updatedAt: now })
        .returning()
        .get()
      createdExchangeIds.set(name, inserted.id)
    }

    for (const row of rowsToInsert) {
      const resolvedExchangeId =
        row.exchangeName == null
          ? null
          : (row.exchangeId ?? createdExchangeIds.get(row.exchangeName) ?? null)

      tx.insert(transactions)
        .values({
          date: row.date,
          type: row.type,
          coinId: row.coinId,
          quantity: row.quantity,
          valueBrl: row.valueBrl,
          feeBrl: row.feeBrl,
          exchangeId: resolvedExchangeId,
          // BACKUP-05: forced unconditionally, regardless of the CSV's
          // `origem` cell — the raw cell only feeds the dedupe key above,
          // it never becomes the stored origin of a freshly imported row.
          origin: 'csv-import',
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  })

  return c.json({
    imported: rowsToInsert.length,
    duplicates_skipped: duplicatesSkipped,
    new_exchanges: pendingExchangeNames,
  })
})
