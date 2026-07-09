import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { coins, exchanges, transactions } from '../../db/schema.ts'
import { toDecimal } from '../../lib/decimal.ts'
import { findLedgerNegativePoint, validateSellTransaction } from '../../engine/validation.ts'
import { computeSerializedPositions, loadLedger } from './positions.ts'

export const transactionsRoute = new Hono()

// Brazil is UTC-3: from ~21:00 local onward, toISOString() has already
// rolled to tomorrow's UTC date. The transaction `date` is the value used
// for IR reporting, so "today" must be the user's local (BRT) calendar
// date, not UTC (WR-01).
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

interface BuyBody {
  date?: string
  coin_id?: number
  quantity?: string
  value_brl?: string
  fee_brl?: string
  // Optional (product decision): a transaction can be recorded without
  // an exchange. `null`/undefined/omitted all mean "not set".
  exchange_id?: number | null
  origin?: string
}

/**
 * Validates the common fields shared by buy/sell payloads. Returns an
 * error message string, or null when valid. Never leaks internal state —
 * messages are safe, user-facing pt-BR strings (Security V7 / T-01-04).
 * exchange_id is intentionally NOT required here.
 */
function validateCommonFields(body: BuyBody): string | null {
  const { date, coin_id, quantity, value_brl, fee_brl } = body

  if (!date || coin_id == null || !quantity || value_brl == null || fee_brl == null) {
    return 'Campos obrigatórios ausentes: date, coin_id, quantity, value_brl, fee_brl.'
  }

  if (date > todayIso()) {
    return 'A data da transação não pode ser no futuro.'
  }

  let qtyDecimal
  try {
    qtyDecimal = toDecimal(quantity)
  } catch {
    return 'Quantidade inválida.'
  }
  if (!qtyDecimal.gt(0)) {
    return 'A quantidade deve ser maior que zero.'
  }

  let valueDecimal
  let feeDecimal
  try {
    valueDecimal = toDecimal(value_brl)
    feeDecimal = toDecimal(fee_brl)
  } catch {
    return 'Valor ou taxa inválidos.'
  }
  if (valueDecimal.lt(0) || feeDecimal.lt(0)) {
    return 'Valor e taxa não podem ser negativos.'
  }

  return null
}

function coinExists(coinId: number): boolean {
  return db.select({ id: coins.id }).from(coins).where(eq(coins.id, coinId)).get() != null
}

function exchangeExists(exchangeId: number): boolean {
  return (
    db.select({ id: exchanges.id }).from(exchanges).where(eq(exchanges.id, exchangeId)).get() !=
    null
  )
}

/**
 * Normalizes an incoming exchange_id: null/undefined/0 all mean "not
 * set" -> null. Returns an error message if a non-null id was provided
 * but doesn't exist.
 */
function resolveExchangeId(exchangeId: number | null | undefined): {
  value: number | null
  error: string | null
} {
  if (exchangeId == null) {
    return { value: null, error: null }
  }
  if (!exchangeExists(exchangeId)) {
    return { value: null, error: 'Exchange não encontrada.' }
  }
  return { value: exchangeId, error: null }
}

transactionsRoute.post('/buy', async (c) => {
  const body = await c.req.json<BuyBody>().catch(() => null)
  if (!body) {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const validationError = validateCommonFields(body)
  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const { date, coin_id, quantity, value_brl, fee_brl, origin } = body as Required<
    Omit<BuyBody, 'origin' | 'exchange_id'>
  > &
    Pick<BuyBody, 'origin' | 'exchange_id'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }

  const { value: exchangeId, error: exchangeError } = resolveExchangeId(body.exchange_id)
  if (exchangeError) {
    return c.json({ error: exchangeError }, 400)
  }

  const now = new Date().toISOString()

  const inserted = db
    .insert(transactions)
    .values({
      date,
      type: 'buy',
      coinId: coin_id,
      quantity: String(quantity),
      valueBrl: String(value_brl),
      feeBrl: String(fee_brl),
      exchangeId,
      origin: origin ?? 'manual',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()

  return c.json(
    {
      transaction: inserted,
      positions: computeSerializedPositions(),
    },
    201,
  )
})

transactionsRoute.post('/sell', async (c) => {
  const body = await c.req.json<BuyBody>().catch(() => null)
  if (!body) {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const validationError = validateCommonFields(body)
  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const { date, coin_id, quantity, value_brl, fee_brl, origin } = body as Required<
    Omit<BuyBody, 'origin' | 'exchange_id'>
  > &
    Pick<BuyBody, 'origin' | 'exchange_id'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }

  const { value: exchangeId, error: exchangeError } = resolveExchangeId(body.exchange_id)
  if (exchangeError) {
    return c.json({ error: exchangeError }, 400)
  }

  // Authoritative server-side chronological validation BEFORE insert
  // (D-07/D-08). Client-side warnings are advisory only (T-01-02).
  const sellValidation = validateSellTransaction(
    { date, coinId: coin_id, quantity: String(quantity) },
    loadLedger(),
  )
  if (!sellValidation.valid) {
    return c.json({ error: sellValidation.reason }, 400)
  }

  const now = new Date().toISOString()

  const inserted = db
    .insert(transactions)
    .values({
      date,
      type: 'sell',
      coinId: coin_id,
      quantity: String(quantity),
      // value_brl (valor recebido) is inert for Phase 1 math — stored for
      // a future capital-gains phase.
      valueBrl: String(value_brl),
      feeBrl: String(fee_brl),
      exchangeId,
      origin: origin ?? 'manual',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()

  return c.json(
    {
      transaction: inserted,
      positions: computeSerializedPositions(),
    },
    201,
  )
})

transactionsRoute.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Id inválido.' }, 400)
  }

  const existingRow = db.select().from(transactions).where(eq(transactions.id, id)).get()
  if (!existingRow) {
    return c.json({ error: 'Transação não encontrada.' }, 404)
  }

  const body = await c.req.json<BuyBody>().catch(() => null)
  if (!body) {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const validationError = validateCommonFields(body)
  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const { date, coin_id, quantity, value_brl, fee_brl, origin } = body as Required<
    Omit<BuyBody, 'origin' | 'exchange_id'>
  > &
    Pick<BuyBody, 'origin' | 'exchange_id'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }

  const { value: exchangeId, error: exchangeError } = resolveExchangeId(body.exchange_id)
  if (exchangeError) {
    return c.json({ error: exchangeError }, 400)
  }

  // Re-validate the full chronological timeline for this edit (D-07/D-08,
  // D-12). If the edited row is itself a sell, reuse the candidate-based
  // validator (preserves TX-02's existing tested behavior/messages).
  // Otherwise (editing a BUY's date/quantity/coin), a chronological
  // re-check is still required: reducing or delaying a buy can silently
  // invalidate a later sell that already depended on it (CR-01) — a path
  // validateSellTransaction alone never catches, since it only runs when
  // the mutated row is a sell.
  if (existingRow.type === 'sell') {
    const sellValidation = validateSellTransaction(
      { id, date, coinId: coin_id, quantity: String(quantity) },
      loadLedger(),
    )
    if (!sellValidation.valid) {
      return c.json({ error: sellValidation.reason }, 400)
    }
  } else {
    const postEditLedger = loadLedger()
      .filter((tx) => tx.id !== id)
      .filter((tx) => tx.coinId === existingRow.coinId)
      .concat(
        coin_id === existingRow.coinId
          ? [{ ...existingRow, date, coinId: coin_id, quantity: String(quantity) }]
          : [],
      )
    const negativePoint = findLedgerNegativePoint(postEditLedger)
    if (negativePoint) {
      return c.json(
        { error: `Esta alteração deixaria a posição negativa em ${negativePoint.date}.` },
        400,
      )
    }
  }

  const now = new Date().toISOString()

  const updated = db
    .update(transactions)
    .set({
      date,
      coinId: coin_id,
      quantity: String(quantity),
      valueBrl: String(value_brl),
      feeBrl: String(fee_brl),
      exchangeId,
      origin: origin ?? existingRow.origin,
      updatedAt: now,
    })
    .where(eq(transactions.id, id))
    .returning()
    .get()

  return c.json({
    transaction: updated,
    // All positions come from calculatePositions() over the current
    // ledger — never a stored/cached column (TX-04, D-12).
    positions: computeSerializedPositions(),
  })
})

transactionsRoute.delete('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) {
    return c.json({ error: 'Id inválido.' }, 400)
  }

  const existingRow = db.select().from(transactions).where(eq(transactions.id, id)).get()
  if (!existingRow) {
    return c.json({ error: 'Transação não encontrada.' }, 404)
  }

  // Re-validate the full chronological timeline before deleting (CR-02):
  // removing a buy that a later sell depends on must be blocked the same
  // way editing it down is, otherwise the ledger can be driven negative
  // through delete instead of edit (D-07/D-08, TX-05).
  const postDeleteLedger = loadLedger()
    .filter((tx) => tx.id !== id)
    .filter((tx) => tx.coinId === existingRow.coinId)
  const negativePoint = findLedgerNegativePoint(postDeleteLedger)
  if (negativePoint) {
    return c.json(
      {
        error: `Não é possível excluir: a posição ficaria negativa em ${negativePoint.date}.`,
      },
      400,
    )
  }

  db.delete(transactions).where(eq(transactions.id, id)).run()

  return c.json({
    // Recomputed from the ledger with the row gone — if that was the
    // coin's last transaction, its position row disappears (TX-05, D-12).
    positions: computeSerializedPositions(),
  })
})

transactionsRoute.get('/', (c) => {
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      coinId: transactions.coinId,
      coinSymbol: coins.symbol,
      coinName: coins.name,
      quantity: transactions.quantity,
      valueBrl: transactions.valueBrl,
      feeBrl: transactions.feeBrl,
      exchangeId: transactions.exchangeId,
      exchangeName: exchanges.name,
      origin: transactions.origin,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .innerJoin(coins, eq(transactions.coinId, coins.id))
    // LEFT join: exchange is optional, so a transaction without one must
    // still be returned (exchangeName comes back null).
    .leftJoin(exchanges, eq(transactions.exchangeId, exchanges.id))
    .orderBy(asc(transactions.date), asc(transactions.createdAt))
    .all()

  return c.json(
    rows.map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      coin_id: row.coinId,
      coin_symbol: row.coinSymbol,
      coin_name: row.coinName,
      quantity: row.quantity,
      value_brl: row.valueBrl,
      fee_brl: row.feeBrl,
      exchange_id: row.exchangeId,
      exchange_name: row.exchangeName,
      origin: row.origin,
      created_at: row.createdAt,
    })),
  )
})
