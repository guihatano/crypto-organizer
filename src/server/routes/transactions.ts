import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { coins, exchanges, transactions } from '../../db/schema.ts'
import { toDecimal } from '../../lib/decimal.ts'
import { validateSellTransaction } from '../../engine/validation.ts'
import { computeSerializedPositions, loadLedger } from './positions.ts'

export const transactionsRoute = new Hono()

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface BuyBody {
  date?: string
  coin_id?: number
  quantity?: string
  value_brl?: string
  fee_brl?: string
  exchange_id?: number
  origin?: string
}

/**
 * Validates the common fields shared by buy/sell payloads. Returns an
 * error message string, or null when valid. Never leaks internal state —
 * messages are safe, user-facing pt-BR strings (Security V7 / T-01-04).
 */
function validateCommonFields(body: BuyBody): string | null {
  const { date, coin_id, quantity, value_brl, fee_brl, exchange_id } = body

  if (
    !date ||
    coin_id == null ||
    !quantity ||
    value_brl == null ||
    fee_brl == null ||
    exchange_id == null
  ) {
    return 'Campos obrigatórios ausentes: date, coin_id, quantity, value_brl, fee_brl, exchange_id.'
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

  try {
    toDecimal(value_brl)
    toDecimal(fee_brl)
  } catch {
    return 'Valor ou taxa inválidos.'
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

transactionsRoute.post('/buy', async (c) => {
  const body = await c.req.json<BuyBody>().catch(() => null)
  if (!body) {
    return c.json({ error: 'Corpo da requisição inválido.' }, 400)
  }

  const validationError = validateCommonFields(body)
  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const { date, coin_id, quantity, value_brl, fee_brl, exchange_id, origin } = body as Required<
    Omit<BuyBody, 'origin'>
  > &
    Pick<BuyBody, 'origin'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }
  if (!exchangeExists(exchange_id)) {
    return c.json({ error: 'Exchange não encontrada.' }, 400)
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
      exchangeId: exchange_id,
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

  const { date, coin_id, quantity, value_brl, fee_brl, exchange_id, origin } = body as Required<
    Omit<BuyBody, 'origin'>
  > &
    Pick<BuyBody, 'origin'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }
  if (!exchangeExists(exchange_id)) {
    return c.json({ error: 'Exchange não encontrada.' }, 400)
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
      exchangeId: exchange_id,
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

  const { date, coin_id, quantity, value_brl, fee_brl, exchange_id, origin } = body as Required<
    Omit<BuyBody, 'origin'>
  > &
    Pick<BuyBody, 'origin'>

  if (!coinExists(coin_id)) {
    return c.json({ error: 'Moeda não encontrada.' }, 400)
  }
  if (!exchangeExists(exchange_id)) {
    return c.json({ error: 'Exchange não encontrada.' }, 400)
  }

  // Re-validate chronologically if the edited row is a sell (D-12). The
  // ledger loaded here still contains the OLD version of this row;
  // validateSellTransaction excludes it by id before replaying.
  if (existingRow.type === 'sell') {
    const sellValidation = validateSellTransaction(
      { id, date, coinId: coin_id, quantity: String(quantity) },
      loadLedger(),
    )
    if (!sellValidation.valid) {
      return c.json({ error: sellValidation.reason }, 400)
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
      exchangeId: exchange_id,
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
    .innerJoin(exchanges, eq(transactions.exchangeId, exchanges.id))
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
