# Architecture Research

**Domain:** Personal crypto portfolio tracker — local-first, single-user, Brazilian IR (Bens e Direitos) reporting
**Researched:** 2026-07-03
**Confidence:** MEDIUM (core patterns well-established; Brazilian IR rules confirmed via Receita Federal and exchange sources; confidence tagged LOW per websearch provider but cross-checked against multiple independent sources)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          UI Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Transaction  │  │  Portfolio   │  │   IR Report View   │    │
│  │  Entry Form  │  │  Dashboard   │  │  (Bens e Direitos) │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
└─────────┼────────────────┼───────────────────┼─────────────────┘
          │ write           │ read              │ read
┌─────────▼────────────────▼───────────────────▼─────────────────┐
│                     Application Layer                           │
│  ┌───────────────────────────┐  ┌─────────────────────────┐    │
│  │     Position Engine       │  │    Report Generator     │    │
│  │  (pure fn: replay ledger) │  │ (point-in-time replay)  │    │
│  └─────────────┬─────────────┘  └────────────┬────────────┘    │
│                │ reads                        │ reads           │
│  ┌─────────────▼──────────────────────────────▼────────────┐   │
│  │                   Ledger Store                          │   │
│  │         (append-only SQLite transactions table)         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │   Price Fetcher      │  │       Price Cache            │    │
│  │ (CoinGecko API call) │→ │ (SQLite price_cache table)   │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│            ↑ async / best-effort (never blocks core data)       │
└─────────────────────────────────────────────────────────────────┘
```

The two subsystems — **core ledger + position engine** and **price enrichment** — are deliberately isolated. Tax/IR data never depends on price availability.

---

## Component Responsibilities

| Component | Responsibility | Key Constraint |
|-----------|----------------|----------------|
| **Ledger Store** | Persist raw transactions (buys/sells). Append-only — no updates, no deletes. | Source of truth for all derived state |
| **Position Engine** | Replay the ledger to derive: quantity held, preço médio, custo de aquisição per asset. Pure function — same inputs always yield same outputs. | Must use big.js arithmetic; no floats |
| **Report Generator** | Replay the ledger filtered to `date <= target_date` to produce a Bens e Direitos snapshot. | Same engine as Position Engine, with a date cutoff |
| **Price Fetcher** | Call CoinGecko API for current BRL prices. Async, best-effort. | Never blocks; returns null on error |
| **Price Cache** | Store last-known prices with timestamp. Serve stale data when API is down. | SQLite table with fetched_at column |
| **Transaction Entry Form** | UI to record a new buy or sell (asset, qty, BRL amount, date, exchange). | Validates that qty and amount are positive |
| **Portfolio Dashboard** | Show current positions (from Position Engine) enriched with market price (from Price Cache). | Shows "price unavailable" gracefully when cache is stale |
| **IR Report View** | Display Bens e Direitos table for a selected year (Dec 31 snapshot). | Renders only from ledger — zero price dependency |

---

## Data Model

### transactions (ledger — append-only)

```
id            TEXT PRIMARY KEY  -- UUID
date          TEXT NOT NULL     -- ISO date: "2024-03-15" (the trade date, not insert date)
asset         TEXT NOT NULL     -- "BTC", "ETH", etc.
type          TEXT NOT NULL     -- "buy" | "sell"
quantity      TEXT NOT NULL     -- stored as string, parsed via big.js (e.g. "0.00312500")
brl_amount    TEXT NOT NULL     -- total BRL value of the trade, as string centavos or decimal
exchange      TEXT NOT NULL     -- "Binance", "Mercado Bitcoin", etc.
notes         TEXT              -- optional free text
created_at    TEXT NOT NULL     -- ISO timestamp of record insertion
```

**Why store quantity and brl_amount as TEXT strings?** SQLite's REAL is IEEE 754 double-precision — the same float that causes 0.1 + 0.2 = 0.30000000000000004. Storing as TEXT and parsing through big.js eliminates all precision loss.

### price_cache

```
asset         TEXT PRIMARY KEY  -- "BTC"
price_brl     TEXT NOT NULL     -- current BRL price as string
fetched_at    TEXT NOT NULL     -- ISO timestamp
```

TTL for staleness check: 5 minutes. Serve stale on error; never throw.

---

## Position Engine: The Core Algorithm

This is the most correctness-critical code in the system. It must be pure, deterministic, and use big.js throughout.

```typescript
import Big from 'big.js'

interface Transaction {
  date: string
  asset: string
  type: 'buy' | 'sell'
  quantity: string   // raw string from DB
  brl_amount: string // raw string from DB
  exchange: string
}

interface AssetPosition {
  asset: string
  quantity: Big       // units held
  custo_aquisicao: Big // total BRL cost basis
  preco_medio: Big    // custo_aquisicao / quantity (unit cost)
}

function computePositions(
  transactions: Transaction[],
  asOf?: string  // ISO date — if provided, only replay up to this date (inclusive)
): Map<string, AssetPosition> {

  const sorted = [...transactions]
    .filter(t => !asOf || t.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))

  const positions = new Map<string, AssetPosition>()

  for (const tx of sorted) {
    const pos = positions.get(tx.asset) ?? {
      asset: tx.asset,
      quantity: new Big(0),
      custo_aquisicao: new Big(0),
      preco_medio: new Big(0),
    }

    const qty = new Big(tx.quantity)
    const brl = new Big(tx.brl_amount)

    if (tx.type === 'buy') {
      // Weighted average: new pm = (old_cost + new_cost) / (old_qty + new_qty)
      const new_qty = pos.quantity.plus(qty)
      const new_cost = pos.custo_aquisicao.plus(brl)
      pos.quantity = new_qty
      pos.custo_aquisicao = new_cost
      pos.preco_medio = new_qty.gt(0) ? new_cost.div(new_qty) : new Big(0)
    } else {
      // Brazilian rule: preço médio DOES NOT CHANGE on sell
      // custo_aquisicao drops by preco_medio * qty_sold
      const cost_of_sold = pos.preco_medio.times(qty)
      pos.quantity = pos.quantity.minus(qty)
      pos.custo_aquisicao = pos.custo_aquisicao.minus(cost_of_sold)
      // preco_medio is unchanged (this is the Brazilian rule — not FIFO, not LIFO)
    }

    positions.set(tx.asset, pos)
  }

  // Remove fully exited positions (quantity == 0)
  for (const [asset, pos] of positions) {
    if (pos.quantity.lte(0)) positions.delete(asset)
  }

  return positions
}
```

**Key invariant:** `preco_medio` is only recalculated on buys, never on sells. This matches the Brazilian Receita Federal rule (custo médio ponderado): selling does not change the unit cost of remaining units.

---

## Brazilian IR Rules Encoded in Architecture

The Receita Federal requires that Bens e Direitos declarations include:

- Each crypto type with custo de aquisição >= R$5,000 as of December 31
- The value declared is the **custo de aquisição** (what you paid), NOT current market value
- Each crypto declared separately (BTC under code 81, altcoins under appropriate codes)
- Exchange of origin noted in the "Discriminação" field

The Report Generator is simply `computePositions(allTransactions, asOf="YYYY-12-31")`. No additional logic needed — the ledger replay at a point in time IS the Bens e Direitos snapshot.

---

## Data Flow

### Recording a Transaction

```
User fills form (asset, date, type, qty, BRL amount, exchange)
  ↓
Validation (qty > 0, brl_amount > 0, date not in future)
  ↓
INSERT into transactions (append-only, never UPDATE)
  ↓
Position Engine replays full ledger → updated positions
  ↓
Portfolio Dashboard re-renders with new positions
```

### Viewing Current Portfolio

```
Page load
  ↓
Position Engine: replay full ledger → {quantity, preco_medio, custo_aquisicao} per asset
  ↓
Price Cache: load last-known prices (no API call on every view)
  ↓
Price Fetcher: async background refresh if cache is >5 min stale
     ↓ success → update price_cache, re-render market values
     ↓ failure → keep stale prices, show "cotação indisponível" badge
  ↓
Portfolio Dashboard: show both layers
  - Tax column (custo_aquisicao) — always available, no API dependency
  - Market column (qty × current_price) — shows "—" when price unavailable
```

### Generating Bens e Direitos Report

```
User selects year (e.g. 2024)
  ↓
Report Generator: computePositions(transactions, asOf="2024-12-31")
  ↓
Filter: only assets with custo_aquisicao >= R$5,000
  ↓
Render table: asset | qty | custo_aquisicao | exchange | IR code
  ↓
Optional: copy-to-clipboard in the "Discriminação" format for IRPF software
```

---

## Recommended Project Structure

```
src/
├── db/
│   ├── schema.ts          # Drizzle schema: transactions, price_cache
│   ├── client.ts          # better-sqlite3 connection singleton
│   └── migrations/        # Drizzle migration files
├── engine/
│   ├── positions.ts       # computePositions() — the core pure function
│   ├── money.ts           # big.js wrappers: parseBRL(), formatBRL(), formatQty()
│   └── positions.test.ts  # Unit tests for the algorithm (critical)
├── prices/
│   ├── coingecko.ts       # API client (fetch wrapper, respects rate limits)
│   ├── cache.ts           # Read/write price_cache, TTL check, stale fallback
│   └── refresh.ts         # Background refresh scheduler
├── reports/
│   └── bens-e-direitos.ts # Point-in-time snapshot, IR code mapping, formatting
├── routes/
│   ├── transactions.ts    # GET list, POST new transaction
│   ├── portfolio.ts       # GET current positions (ledger + price enrichment)
│   └── reports.ts         # GET Bens e Direitos for a given year
└── ui/
    ├── TransactionForm/
    ├── PortfolioDashboard/
    └── IRReport/
```

### Structure Rationale

- **db/**: All database concerns isolated here; schema changes only touch this layer.
- **engine/**: Zero I/O, pure functions. Can be tested without a database. This is where correctness lives.
- **prices/**: Entirely optional enrichment layer. Deleting this folder would not affect tax correctness.
- **reports/**: Thin layer — mostly calls `computePositions()` with a date and formats output.
- **routes/**: Thin HTTP handlers; delegate to engine and db layers.
- **ui/**: Components consume data from routes; no business logic here.

---

## Architectural Patterns

### Pattern 1: Append-Only Ledger (Event Sourcing Lite)

**What:** Never mutate or delete transaction records. Every buy/sell is a permanent historical fact. If a user made a data entry error, record a correcting transaction (sell what was wrongly bought, or add a memo-flagged adjustment), not an UPDATE.

**When to use:** Always, for the transactions table. This is non-negotiable for financial data.

**Trade-offs:** Slightly more complex to "undo" an entry (need a compensating transaction), but correctness and auditability are guaranteed. With only dozens to hundreds of entries per user, replay performance is negligible.

**Example:**
```typescript
// Correct approach: append-only
db.insert(transactions).values({ type: 'buy', ... })

// NEVER do this:
db.update(transactions).set({ quantity: '0.5' }).where(eq(transactions.id, id))
```

### Pattern 2: Recompute-on-Read for Derived State

**What:** Never store preço médio or custo de aquisição in the database. Recompute them every time from the raw transaction ledger. For a single user with hundreds of transactions, full-ledger replay takes under 1ms.

**When to use:** Always. Storing derived state is a trap: if the computation logic has a bug (e.g., wrong rounding), fixing the bug requires a data migration. With recompute-on-read, fixing the bug instantly corrects all historical positions.

**Trade-offs:** If the ledger grows to tens of thousands of entries, consider a materialized cache (a periodic snapshot + replay-from-snapshot). At personal portfolio scale (< 10,000 transactions in a lifetime), this is premature.

### Pattern 3: Price Enrichment as Optional Overlay

**What:** The Position Engine returns tax-correct data. Market prices are added as a second pass using the Price Cache. The UI renders tax data unconditionally and market data conditionally.

**When to use:** Always. This ensures the app remains fully functional for IR reporting even when CoinGecko is down, rate-limited, or the user is offline.

**Example:**
```typescript
const positions = computePositions(transactions)  // always works

// Optional enrichment — never throws, never blocks
const prices = await getPricesFromCache(positions.keys())
const enriched = positions.map(pos => ({
  ...pos,
  market_value: prices[pos.asset]
    ? new Big(prices[pos.asset]).times(pos.quantity)
    : null  // UI shows "—"
}))
```

---

## Anti-Patterns

### Anti-Pattern 1: Storing Derived State in the Database

**What people do:** Add columns `preco_medio` and `custo_aquisicao` to the transactions table and update them on each new transaction.

**Why it's wrong:** When you find a bug in the computation logic (and you will), you now have stale incorrect data in the database that must be migrated. The computed values become a lie the moment the algorithm changes.

**Do this instead:** Store only raw inputs. Recompute derived state in the Position Engine on every read. At personal scale, this is always fast enough.

### Anti-Pattern 2: Using JavaScript Native Floats for BRL Arithmetic

**What people do:** `const preco_medio = total_cost / total_qty` using regular JS numbers.

**Why it's wrong:** `(0.1 + 0.2) === 0.30000000000000004`. Financial calculations accumulate these errors across hundreds of transactions. The custo de aquisição reported to Receita Federal will be subtly wrong.

**Do this instead:** Store quantities and amounts as TEXT strings. Parse with `new Big(value)`. All arithmetic uses `big.js` methods (`.plus()`, `.minus()`, `.times()`, `.div()`). Convert to display string only at the UI boundary.

### Anti-Pattern 3: Blocking Tax Data on Price API Availability

**What people do:** Fetch current price inside `computePositions()` to compute "real" custo de aquisição.

**Why it's wrong:** `custo de aquisição` is defined by law as what you PAID, not current market value. Fetching current prices inside the core engine also makes it async, untestable, and unavailable offline — breaking the IR report when the API is down.

**Do this instead:** Keep the Position Engine synchronous and price-free. Add market enrichment as a separate, optional async step.

### Anti-Pattern 4: One Table Per Exchange

**What people do:** Create separate tables for each exchange's transactions.

**Why it's wrong:** The preço médio in Brazil is calculated across all exchanges. BTC bought on Binance and BTC bought on Mercado Bitcoin share the same preço médio pool. Separate tables make the cross-exchange weighted average impossible to compute correctly.

**Do this instead:** Single `transactions` table with an `exchange` column. The exchange field is metadata for Bens e Direitos "Discriminação" notes, not a partitioning key.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| CoinGecko API (free/demo) | Background polling with local SQLite cache; stale-while-revalidate | Free: ~30 req/min public, 100 req/min with demo key; 10k calls/month cap. Cache prices for 5 min. Never block on this. |
| CoinGecko alternative: CoinCap | Fallback if CoinGecko is throttled | Simpler API, fewer coins, but free and reliable for BTC/ETH/top assets |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ Routes | HTTP/JSON (REST or tRPC) | Routes are thin — all logic is in engine/ layer |
| Routes ↔ Engine | Direct function call (same process) | Engine is pure TS, no async, no I/O |
| Routes ↔ DB | Drizzle ORM queries | Drizzle types enforce schema at compile time |
| Routes ↔ Price Cache | Async function; returns null on miss | Never throws; never awaited in hot path |
| Engine ↔ DB | No direct dependency | Engine receives `Transaction[]` as input; the route layer fetches from DB and passes in |

---

## Suggested Build Order

Dependencies flow top-to-bottom. Each layer can be tested independently before the next is built.

```
1. Ledger Store          ← schema, migrations, basic CRUD (no computation yet)
        ↓
2. Position Engine       ← pure functions, fully unit-testable without DB
        ↓
3. Transaction Entry UI  ← form → write to ledger → read positions
        ↓
4. Portfolio Dashboard   ← read positions, display core data (no prices yet)
        ↓
5. Price Cache + Fetcher ← enrich dashboard with market data; test offline path
        ↓
6. Report Generator      ← point-in-time replay, IR code mapping, formatting
        ↓
7. IR Report UI          ← display Bens e Direitos table; copy-to-clipboard
```

**Rationale:**
- Steps 1–4 deliver end-to-end correctness for the core value proposition (preço médio, custo de aquisição) without any external dependency.
- Step 5 is isolated risk: if CoinGecko integration proves unreliable, steps 1–4 still work perfectly.
- Steps 6–7 are the primary deliverable (Bens e Direitos reporting) and depend on a proven engine from steps 2–3.
- Never start the Report Generator until the Position Engine has passing unit tests for the buy/sell algorithm.

---

## Scaling Considerations

This is a single-user local app. Scale is not a concern. However, two future-proofing notes:

| Concern | At personal scale (< 10k transactions) | If hosted multi-user later |
|---------|----------------------------------------|---------------------------|
| Replay performance | Sub-millisecond for full ledger; no caching needed | Add periodic snapshots as starting points |
| Database | SQLite file is sufficient indefinitely | Migrate to PostgreSQL; Drizzle schema is portable |
| Auth | Not needed (local-first) | Add session-based auth; wrap all routes |
| Price API | Free tier is sufficient | Add API key management per user |

---

## Sources

- [Building your own Ledger Database — Architecture Weekly](https://www.architecture-weekly.com/p/building-your-own-ledger-database)
- [Event Sourcing and the History of Accounting — DEV Community](https://dev.to/dealeron/event-sourcing-and-the-history-of-accounting-1aah)
- [Koinly: How to Calculate Crypto Cost Basis](https://koinly.io/blog/calculate-cost-basis-crypto-bitcoin/)
- [How to Implement Average Cost Basis for Cryptocurrency Trading — FasterCapital](https://fastercapital.com/content/How-to-Implement-the-Average-Cost-Basis-Method-for-Cryptocurrency-Trading.html)
- [Mastering Money Calculations in JavaScript: Libraries Compared — Medium](https://miladezzat.medium.com/mastering-money-calculations-in-javascript-the-best-libraries-compared-8e4ae03dac58)
- [decimal.js vs big.js vs bignumber.js 2026 — PkgPulse](https://www.pkgpulse.com/guides/decimal-js-vs-big-js-vs-bignumber-js-arbitrary-2026)
- [Offline-first frontend apps 2025: IndexedDB and SQLite — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Drizzle ORM + SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [CoinGecko API rate limits — CoinGecko Support](https://support.coingecko.com/hc/en-us/articles/4538771776153)
- [Como declarar criptomoedas no IR 2025 — Blocktrends](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-de-renda-2025/)
- [Receita Federal: declaração de operações com criptoativos](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2023/marco/receita-federal-esclarece-sobre-declaracao-de-operacoes-com-criptoativos)
- [Imposto de Renda 2026: como declarar Bitcoin — Mercado Bitcoin](https://www.mercadobitcoin.com.br/blog/seguranca/como-declarar-bitcoin/)

---

*Architecture research for: crypto-organizer (personal crypto portfolio tracker, Brazilian IR)*
*Researched: 2026-07-03*
