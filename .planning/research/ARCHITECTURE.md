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

---
---

# v1.1 Milestone Addendum: Dark Mode, Auth, CSV Backup

**Scope:** This addendum researches ONLY the three new v1.1 features — dark mode, single-user username+password auth, and CSV export/import backup. It assumes and builds on the v1.0 architecture above (append-only ledger, recompute-on-read, price isolation), which is unchanged by this milestone.

**Researched:** 2026-07-17
**Confidence:** MEDIUM (official docs cross-checked for Hono cookies, Tailwind v4 dark mode, and shadcn/ui Vite guide via WebFetch; LOW-confidence websearch for password-hashing library choice and CSV-library recommendations — verify version numbers before pinning in planning)

## Current State (grounding, from reading the shipped v1.0 codebase)

The v1.0 codebase differs in a few concrete ways from the generic template above (drift is expected — that template predates implementation), and these specifics drive every recommendation below:

- **Backend:** `src/server/index.ts` is a flat Hono app — `app.route('/api/x', xRoute)` for six route modules (`coins`, `exchanges`, `irReport`, `positions`, `prices`, `transactions`, `rate`), no middleware registered anywhere yet. All `/api/*` is open.
- **DB:** Drizzle over better-sqlite3 (`src/db/client.ts`, `src/db/schema.ts`). Three tables: `coins`, `exchanges`, `transactions`. `transactions` already has an `origin` column (`text().notNull().default('manual')`) — deliberately seeded in Phase 1 so a future importer "only adds rows with a different origin value — no schema change needed." **CSV import can and should use this column as-is** (e.g. `origin: 'csv-import'`, or preserve the original row's origin on re-import).
- **Money/qty fields are TEXT, never REAL** (Decimal.js discipline). Any CSV round-trip must preserve these as strings verbatim — never pass through `Number()`.
- **Frontend:** `src/api/client.ts` is a hand-rolled `fetch` wrapper (no axios), relative `/api` base URL, no `credentials` option set. Since frontend and API share an origin (Vite dev proxy → same-origin in prod), **the browser sends cookies automatically without any client change** — a cookie-based session needs zero `apiClient` changes beyond adding a 401 handler.
- **Styling:** `src/index.css` is just `@import 'tailwindcss';` — no `@theme`, no CSS variables, no `@custom-variant`. Components use **raw Tailwind gray-scale utilities directly** (`bg-white`, `text-gray-900`, `border-gray-200`, etc.), not semantic tokens. **shadcn/ui is not actually scaffolded yet** — `tailwindcss`/`@tailwindcss/vite` are installed but there's no `components/ui/` directory, no `components.json`, no `cn()` helper. `lucide-react` is present and used directly in `App.tsx`.
- **State:** TanStack Query for all server state; `localStorage` already used for a UI preference (`currency`), which is the pattern to reuse for a `theme` preference.

This matters most for dark mode: it is not "flip a Tailwind config switch" — it requires either introducing semantic color tokens or applying paired `dark:` variants to every hardcoded gray-scale class across ~14 existing components.

## System Overview — v1.1 additions

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite)                                        │
│  ┌────────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │ThemeProvider│ │ LoginForm/    │ │ Backup panel │ │ existing  │ │
│  │ + useTheme  │ │ AuthGuard     │ │ (export/     │ │ views     │ │
│  │             │ │               │ │ import CSV)  │ │           │ │
│  └──────┬─────┘ └──────┬────────┘ └──────┬───────┘ └─────┬─────┘ │
│         │ localStorage  │ 401 → redirect  │ TanStack Query│        │
│         │ + .dark class │ to /login       │ mutation      │        │
├─────────┴───────────────┴─────────────────┴───────────────┴───────┤
│  apiClient (src/api/client.ts) — fetch, same-origin, cookies auto  │
├──────────────────────────────────────────────────────────────────┤
│  Hono app (src/server/index.ts)                                   │
│  app.get('/api/health')        ← public                            │
│  app.route('/api/auth', ...)   ← public (login/logout/setup)       │
│  app.use('/api/*', authMiddleware)  ← NEW, gates everything below  │
│  app.route('/api/coins', ...)                                      │
│  app.route('/api/transactions', ...)                               │
│  app.route('/api/backup', ...) ← NEW (export/import CSV)           │
│  ...existing routes (now behind authMiddleware)                    │
├──────────────────────────────────────────────────────────────────┤
│  Drizzle ORM → better-sqlite3 (SQLite file)                        │
│  existing tables: coins, exchanges, transactions                   │
│  NEW table: sessions (id, expires_at)                              │
│  NEW table: auth_credentials (single row: hash, params)            │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities — v1.1 additions

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `authMiddleware` (Hono) | Reject unauthenticated requests to protected `/api/*` routes | `app.use('/api/*', ...)` registered **after** public routes (`/api/health`, `/api/auth/*`) are declared — Hono matches/executes middleware in registration order, so route order *is* the access-control mechanism |
| `src/server/auth.ts` (new) | Password verify, session issue/validate/revoke | `crypto.scrypt`-based hash + verify (Node built-in, no new native dependency) or Argon2id via a small library; session id in an HMAC-signed cookie via `hono/cookie`'s `setSignedCookie`/`getSignedCookie` |
| `sessions` table (new) | Persist which session ids are valid (for logout / revocation) | A signed cookie alone can't be revoked server-side before expiry; a tiny `sessions` table (`id`, `expires_at`) makes logout and "kill all sessions" possible — cheap for a single user, recommended over stateless-JWT-only |
| `auth_credentials` table (new) | Store the one username+password hash, first-run "no user yet" state | Single-row table (or `id=1` convention) — presence/absence of the row *is* the "first-run setup" signal, no separate `setup_complete` flag needed |
| `ThemeProvider` (React context, new) | Track `light`/`dark`/`system`, persist to `localStorage`, apply `.dark` class to `<html>` | Modeled on the official shadcn/ui Vite guide — no `next-themes` (that's Next.js-only); mirrors the existing `currency` `localStorage` + `useState` pattern already in `App.tsx` |
| `@custom-variant dark` (CSS, new) | Key `dark:` utilities off a `.dark` class instead of only OS `prefers-color-scheme` | One line added to `src/index.css`: `@custom-variant dark (&:where(.dark, .dark *));` |
| Backup route (`/api/backup`, new) | Serve CSV export (`GET`), accept CSV import (`POST`), dedupe on import | Reads/writes `transactions`, resolving `coins.symbol`/`exchanges.name` to/from FK ids for human-readable CSV |
| Backup panel (React, new) | Trigger download, upload file, show import result (added/skipped counts) | A settings/utility view; download via direct navigation to the export endpoint; upload via `<input type="file">` + `FormData` POST |

## Recommended Project Structure — v1.1 additions

```
src/
├── server/
│   ├── auth.ts                 # NEW — hash/verify, session create/validate/revoke
│   ├── middleware/
│   │   └── auth.ts             # NEW — Hono middleware, reads session cookie, sets c.set('userId', ...)
│   ├── routes/
│   │   ├── auth.ts             # NEW — POST /api/auth/setup, /login, /logout, GET /api/auth/me
│   │   └── backup.ts           # NEW — GET /api/backup/export.csv, POST /api/backup/import
│   └── index.ts                # MODIFIED — register public routes, then app.use('/api/*', authMiddleware), then protected routes
├── db/
│   └── schema.ts                # MODIFIED — add `sessions` table, `auth_credentials` table
├── lib/
│   └── theme.tsx                # NEW — ThemeProvider + useTheme (mirrors existing localStorage pattern used for currency)
├── components/
│   ├── ModeToggle.tsx           # NEW — sun/moon/system dropdown, same interaction pattern as CurrencyToggle.tsx
│   ├── LoginForm.tsx            # NEW — first-run setup screen doubles as the only "create account" UI
│   ├── BackupPanel.tsx          # NEW — export button + import file input, in a new "Settings" area
│   └── ...existing 14 components # MODIFIED (gradually) — swap hardcoded bg-white/text-gray-900/etc. for dark:-aware classes
├── hooks/
│   ├── useAuth.ts                # NEW — TanStack Query wrapping /api/auth/me, login/logout mutations
│   └── useBackup.ts              # NEW — export trigger + import mutation
├── api/
│   └── client.ts                 # MODIFIED — add a 401 handler (redirect to /login) in the shared `request()` function
└── index.css                     # MODIFIED — add @custom-variant dark line
```

### Structure Rationale — v1.1 additions

- **`server/middleware/` is new** — today there's no middleware directory because there's no middleware. This is the natural seam: keep `authMiddleware` (the gate) separate from `routes/auth.ts` (the login/logout HTTP endpoints).
- **`server/auth.ts` (business logic) vs `server/middleware/auth.ts` (gate) vs `routes/auth.ts` (HTTP endpoints)** mirrors the existing split where `coingecko.ts` (fetch logic) is separate from `routes/prices.ts` (HTTP endpoint) — keep the same layering: pure logic → route handler → app registration.
- **`lib/theme.tsx`** goes in `src/lib/` (already exists, holds shared frontend utilities) rather than `components/`, because a context provider isn't a renderable UI component — it's app-shell plumbing, same category as `api/client.ts`.
- **`routes/backup.ts`** is a new route module following the exact pattern of the six existing ones — no new architectural concept, just a seventh `app.route()`.

## Architectural Patterns — v1.1 additions

### Pattern 4: Route-order-as-access-control (Hono middleware gating)

**What:** Register unauthenticated routes first, then `app.use('/api/*', authMiddleware)`, then all routes that must be protected. Hono middleware executes and matches in registration order — there is no separate "allowlist" config; code layout *is* the access-control list.

**When to use:** Exactly this app's shape — one binary "is logged in or not" gate over a REST API, no per-route roles/scopes needed (single user).

**Trade-offs:** Simple and hard to get subtly wrong (no config to drift from the routes), but a new route added *above* the `app.use('/api/*', ...)` line is silently public — worth a code comment or a test that asserts every route except an explicit allowlist returns 401 when unauthenticated.

**Example:**
```typescript
// src/server/index.ts
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoute)          // login/setup/logout — public

app.use('/api/*', authMiddleware)          // everything below this line requires a session

app.route('/api/coins', coinsRoute)
app.route('/api/exchanges', exchangesRoute)
app.route('/api/transactions', transactionsRoute)
app.route('/api/backup', backupRoute)      // export/import now requires login too
```

### Pattern 5: Signed cookie + server-side session record (not JWT-only)

**What:** On login, create a random session id, store it (with expiry) in a `sessions` table, and set it in an `httpOnly`, `secure`, `sameSite: 'Strict'` **signed** cookie via `hono/cookie`'s `setSignedCookie`. On each request, `authMiddleware` calls `getSignedCookie` (rejects tampered values automatically — returns `false`) and checks the session id exists and isn't expired in the `sessions` table.

**When to use:** Single-user local app that may later be hosted. A pure JWT-in-cookie approach (no DB record) can't be revoked before expiry — logout would be cosmetic only. A DB-backed session costs one small table and is trivially revocable (delete the row = instant logout).

**Trade-offs:** One extra table + one query per request (fast — single-row SQLite lookup) vs. the marginal simplicity of stateless JWT. For a single-user app the DB hit is free; revocability is worth it, especially since this milestone explicitly frames auth as "preparation for future hosting."

**Example:**
```typescript
// src/server/middleware/auth.ts
import { getSignedCookie } from 'hono/cookie'
import type { Context, Next } from 'hono'

export async function authMiddleware(c: Context, next: Next) {
  const sessionId = await getSignedCookie(c, process.env.SESSION_SECRET!, 'session_id')
  if (!sessionId || !isValidSession(sessionId)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}
```

### Pattern 6: CSS-variable-free dark mode via `@custom-variant` + progressive `dark:` retrofitting

**What:** Tailwind v4 is CSS-first — there's no `tailwind.config.js` `darkMode` option to flip. Add one line to `src/index.css`:
```css
@import 'tailwindcss';
@custom-variant dark (&:where(.dark, .dark *));
```
This makes every `dark:` utility key off a `.dark` class anywhere in the ancestor tree (toggled by `ThemeProvider` on `<html>`), instead of only following OS `prefers-color-scheme`. Then retrofit existing components by adding paired `dark:bg-gray-900 dark:text-gray-100` classes next to the existing `bg-white text-gray-900`.

**When to use:** This codebase specifically — since components already hardcode Tailwind gray-scale utilities (not shadcn's usual `bg-background`/`text-foreground` semantic tokens), the pragmatic path is adding paired `dark:` classes to the existing ~14 components rather than a big-bang refactor to CSS variables. A semantic-token approach is cleaner long-term but is a much larger diff for a personal app, and shadcn/ui components aren't being adopted wholesale in this milestone.

**Trade-offs:** Retrofitting is mechanical but touches every component file (~14 files) — wide, shallow, low-risk change, better done as its own phase/pass than interleaved with other feature work.

## Data Flow — v1.1 additions

### Auth request flow

```
Browser submits login form
    ↓
POST /api/auth/login {username, password}
    ↓ (public route, no middleware)
routes/auth.ts → auth.ts verifyPassword() [constant-time hash compare]
    ↓ ok
auth.ts createSession() → INSERT sessions row, expiry = now + N days
    ↓
setSignedCookie(c, 'session_id', sessionId, SESSION_SECRET, {httpOnly, secure, sameSite:'Strict'})
    ↓
Browser stores cookie automatically; all subsequent same-origin fetches include it with zero client code change
    ↓
Any /api/* request → authMiddleware → getSignedCookie + sessions lookup → 401 or next()
```

### CSV backup flow

```
EXPORT
GET /api/backup/export.csv (behind auth)
    ↓
routes/backup.ts: SELECT transactions JOIN coins JOIN exchanges
    ↓ resolve coin_id→symbol, exchange_id→name (human-readable CSV, not raw FK ids)
csv-stringify → Content-Disposition: attachment; filename=crypto-organizer-backup-YYYY-MM-DD.csv
    ↓
Browser downloads file

IMPORT
User selects CSV file → POST /api/backup/import (multipart or raw text body)
    ↓
routes/backup.ts: csv-parse → rows
    ↓ for each row: resolve symbol→coin_id, exchange name→exchange_id
    ↓ dedupe check: does an existing transaction match on (date, type, coin_id, quantity, value_brl, fee_brl, exchange_id) exactly?
    ↓ if match → skip; if not → INSERT with origin='csv-import' (or preserve the CSV row's own origin column)
    ↓ wrap all inserts in a single SQLite transaction
Response: { imported: N, skipped: N }
```

### Theme flow

```
App load → ThemeProvider reads localStorage['theme'] (or defaults to 'system')
    ↓
useEffect applies/removes .dark class on document.documentElement
    ↓ (if 'system') also subscribes to matchMedia('(prefers-color-scheme: dark)') changes
User clicks ModeToggle → setTheme('dark'|'light'|'system') → localStorage write + class update
    ↓
Every component with dark: classes repaints via CSS — no re-render/data-flow needed, pure CSS variant
```

## Anti-Patterns — v1.1 additions

### Anti-Pattern 5: Auth middleware registered before public routes are declared

**What people do:** `app.use('/api/*', authMiddleware)` placed at the top of `index.ts`, then adding `/api/auth/login` afterward and special-casing it inside the middleware with a path check.

**Why it's wrong:** Couples the middleware to knowledge of every public route; easy to forget to add a new public route (like `/api/auth/setup`) to that exclusion list — a silent security hole. Hono's routing already solves this via registration order.

**Instead:** Declare every public route (`/api/health`, `/api/auth/*`) *before* the `app.use('/api/*', authMiddleware)` line. No exclusion list to maintain.

### Anti-Pattern 6: Treating CSV import as trusted input

**What people do:** Parse the uploaded CSV and blindly `INSERT` every row, assuming it came from this app's own export.

**Why it's wrong:** Import will also receive hand-edited files, files from a future version with a different column set, or corrupted uploads. Blind inserts risk breaking the Decimal-math invariant (a non-numeric string in `quantity`) or silently duplicating data if the dedupe check is too loose (e.g. matching only on `id`, which won't be stable across a restore-to-fresh-DB scenario).

**Instead:** Validate every row against the same parsing rules the manual entry form uses (parse with Decimal.js, reject rows that don't parse), and dedupe on **content**, not on the exported `id` column. Whether to fail the whole import atomically on one bad row, vs. report per-row skips, is a product decision worth flagging for phase planning — not resolved here.

### Anti-Pattern 7: Non-constant-time password comparison

**What people do:** Roll a manual `hash === storedHash` string comparison.

**Why it's wrong:** String equality short-circuits on the first differing byte — a timing side-channel on a login endpoint, relevant here because this milestone explicitly frames auth as prep for future hosting (no longer localhost-only).

**Instead:** Use the hashing library's own verify function (or `crypto.timingSafeEqual` if hand-rolling scrypt) rather than `===`.

## Integration Points — v1.1 additions

### External Services

None of the three v1.1 features touch CoinGecko or any external API — they're purely internal. This means none of them inherits the "graceful degradation when API is down" pattern that governs `src/server/coingecko.ts`; that isolation stays intact and unaffected by this milestone.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `authMiddleware` ↔ existing route handlers | Hono `Context` — middleware sets nothing the route handlers currently read (routes don't need to know *who* is logged in, only *that* someone is, since it's single-user) | No changes needed inside `routes/coins.ts`, `routes/transactions.ts`, etc. — cheapest possible integration |
| `routes/backup.ts` ↔ `transactions`/`coins`/`exchanges` tables | Direct Drizzle queries, same as every other route | Import must reuse the *same* validation/normalization the transaction-create path already uses (Decimal parsing, FK resolution) rather than duplicating it — check whether `routes/transactions.ts` exposes a reusable "create transaction" function, or whether that logic needs extracting into `src/engine/` so both the form-based create and the CSV import path call one function |
| `ThemeProvider` ↔ existing components | CSS class presence only (`.dark` on `<html>`) — no prop drilling, no context value read by feature components directly (only `ModeToggle` calls `useTheme()`) | Retrofitting existing components means editing className strings, not component logic — low functional risk, but touches every file |
| `apiClient` ↔ auth | `fetch` already same-origin; a session cookie "just works" with zero change to how requests are made | Only needed addition: handle a `401` response globally in `request()` (redirect to a login view) so existing `useQuery`/`useMutation` call sites don't need individual 401 handling |

## Suggested Build Order — v1.1 milestone

Reasoning about dependencies, not final phase boundaries (roadmapper's call):

1. **Auth first, alone.** It's the only feature that changes cross-cutting behavior (every existing route becomes gated) — landing it first means every subsequent v1.1 feature (dark mode UI, backup panel) is built and tested *behind* the login screen, matching real usage. Building dark mode or backup first and retrofitting auth on top risks re-testing UI that auth then hides behind a redirect.
2. **Dark mode second, independent of backup.** No data dependency on auth or backup, but sequencing it after auth means the login screen itself is built dark-mode-aware from the start (cheaper than reworking it after). Also the widest "touches everything" surface (≈14 components), so isolating it in its own phase makes regressions easy to spot in review.
3. **CSV export before CSV import.** Export is read-only and lower-risk (reuses existing list/report query patterns); shipping it first produces real backup files to test import against. Import is the riskiest of the three features (untrusted input, dedupe correctness, FK resolution) and benefits from having real exported files to round-trip against.
4. **Within CSV: reuse, don't duplicate, the transaction-creation validation.** Before writing the import route, check whether the existing create-transaction path (`routes/transactions.ts` + whatever it calls in `src/engine/`) can be called directly from `routes/backup.ts` per-row, rather than re-implementing Decimal parsing and FK lookups a second time. This is a "read the current transactions route/engine boundary first" task for whoever plans the CSV phase.

## Sources — v1.1 additions

- [Hono Cookie Helper](https://hono.dev/docs/helpers/cookie) — official docs, verified via WebFetch: `hono/cookie` exports, signed-cookie async behavior, session pattern (webfetch, cross-checked → MEDIUM)
- [Hono Middleware guide](https://hono.dev/docs/guides/middleware) and [honojs/hono discussion #3537](https://github.com/orgs/honojs/discussions/3537) — route-order-as-access-control pattern for excluding `/login` from auth middleware (websearch, LOW)
- [shadcn/ui — Dark Mode (Vite)](https://ui.shadcn.com/docs/dark-mode/vite) — official guide, verified via WebFetch: hand-rolled ThemeProvider (no next-themes), localStorage persistence, useTheme hook (webfetch, cross-checked → MEDIUM)
- [Tailwind CSS — Dark Mode](https://tailwindcss.com/docs/dark-mode) — official docs, verified via WebFetch: CSS-first `@custom-variant dark` syntax, default `prefers-color-scheme` behavior (webfetch, cross-checked → MEDIUM)
- Password hashing (Argon2id recommended for new apps in 2026; `crypto.scrypt` as zero-dependency fallback; bcrypt has a 72-byte truncation caveat) — multiple 2026 blog posts, no single authoritative source verified in this pass (websearch, LOW — cross-check against the OWASP Password Storage Cheat Sheet before committing to a library choice in planning)
- csv-parse / csv-stringify (node-csv suite) as standard Node.js CSV I/O libraries, stream.Transform-based with sync/callback/stream APIs (websearch, LOW)
- SQLite idempotent upsert via `INSERT ... ON CONFLICT DO NOTHING/UPDATE` for CSV dedupe (websearch, LOW — well-established standard SQL, low practical risk despite LOW source tier)
- Codebase read directly: `src/server/index.ts`, `src/db/schema.ts`, `src/api/client.ts`, `src/App.tsx`, `src/index.css`, `package.json` (HIGH — primary source)

---

*Architecture research for: auth + dark mode + CSV backup on the existing v1.0 Hono/Drizzle/SQLite/React stack (v1.1 milestone)*
*Researched: 2026-07-17*
