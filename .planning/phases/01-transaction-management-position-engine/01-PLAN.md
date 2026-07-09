---
phase: 01-transaction-management-position-engine
plan: 01
type: execute
wave: 0
depends_on: []
autonomous: false
requirements: [TX-01, TX-02, TX-03, TX-04, TX-05, TX-06, TX-07, POS-01, POS-02, POS-03]
files_modified:
  - package.json
  - vite.config.ts
  - vitest.config.ts
  - drizzle.config.ts
  - .env.example
  - index.html
  - src/main.tsx
  - src/App.tsx
  - src/index.css
  - src/db/schema.ts
  - src/db/client.ts
  - src/db/seed.ts
  - src/engine/types.ts
  - src/engine/positionEngine.ts
  - src/engine/validation.ts
  - src/engine/__tests__/positionEngine.test.ts
  - src/engine/__tests__/validation.test.ts
  - src/lib/decimal.ts
  - src/lib/format.ts
  - src/lib/__tests__/format.test.ts
  - src/server/index.ts
  - src/server/routes/transactions.ts
  - src/server/routes/positions.ts
  - src/server/routes/coins.ts
  - src/server/routes/exchanges.ts
  - src/server/routes/rate.ts
  - src/server/coingecko.ts
  - src/server/__tests__/transactions.integration.test.ts
  - src/api/client.ts
  - src/hooks/useTransactions.ts
  - src/components/PositionTable.tsx
  - src/components/TransactionHistory.tsx
  - src/components/TransactionForm.tsx
  - src/components/CoinDropdown.tsx
  - src/components/ExchangeDropdown.tsx
  - src/components/CurrencyInput.tsx
  - src/components/EmptyState.tsx
  - src/components/DeleteConfirmDialog.tsx
user_setup:
  - service: coingecko
    why: "Historical USDT->BRL conversion at transaction-entry time (D-06). OPTIONAL — every conversion path always falls back to manual override, so a missing key never blocks recording a transaction."
    env_vars:
      - name: COINGECKO_API_KEY
        source: "CoinGecko Dashboard -> Developers -> API keys (free Demo tier, no credit card). Leave unset to run keyless with lower rate limits."

must_haves:
  truths:
    - "User can record a buy (date, coin, quantity, value in BRL or USDT, fee/taxa, exchange) via a modal and immediately see it in the chronological transaction history and the position table."
    - "A buy of 1 BTC for R$100.000 with R$500 fee shows custo de aquisicao R$100.500 and preco medio R$100.500/BTC in the position table."
    - "A sell reduces the coin quantity and drops custo de aquisicao proportionally (custo = preco medio * quantidade restante) while the unit preco medio stays EXACTLY unchanged."
    - "Selling more than held at any point in chronological order is blocked with a warning; a missing/failed conversion rate never blocks recording a transaction (manual override always available)."
    - "Editing or deleting any transaction recomputes ALL positions immediately from the full ledger — derived values are never stored in the DB."
  artifacts:
    - "src/engine/positionEngine.ts — pure calculatePositions() that replays the ledger with Decimal.js"
    - "src/engine/validation.ts — validateSellTransaction() with chronological reconstruction"
    - "src/db/schema.ts — Drizzle schema (transactions, coins, exchanges) with TEXT amounts, coingecko_id, origin, CNPJ-ready exchanges"
    - "src/server/routes/transactions.ts + positions.ts — CRUD + derived positions endpoints"
    - "src/server/coingecko.ts — historical USDT->BRL rate with current-rate + manual-override fallback (D-06)"
    - "src/components/TransactionForm.tsx / PositionTable.tsx / TransactionHistory.tsx — modal entry + single-screen views"
    - "src/lib/format.ts — pt-BR Intl.NumberFormat display + comma-decimal input parsing on Decimal.js"
  key_links:
    - "Immutable ledger (transactions table) -> calculatePositions() pure replay -> GET /api/positions -> PositionTable (positions NEVER cached in DB)."
    - "Modal submit -> POST/PATCH/DELETE (with chronological sell validation) -> SQLite TEXT insert -> TanStack Query invalidates ['positions'] + ['transactions'] -> both tables re-render."
    - "TEXT DB values wrapped in new Decimal() -> every arithmetic step uses Decimal (never native Number) -> Intl.NumberFormat only at display."
    - "Non-BRL value entry -> CoinGecko historical rate at tx date -> fallback current rate -> always user-overridable -> stored custo de aquisicao is BRL and never re-fetched (D-05/D-06)."
---

## Phase Goal

**As a** crypto investor tracking Brazilian taxes across several exchanges, **I want to** record my buy and sell transactions and instantly see the correct preco medio and custo de aquisicao for each coin, **so that** I have an accurate, consolidated cost basis computed to the Brazilian tax rules without spreadsheets.

> Derived from the ROADMAP `**Goal:**` line (prose form). All three user-story slots are evident in the roadmap goal plus the CONTEXT single-user framing.

**Concrete success thread:** Record 1 BTC buy for R$100.000 with R$500 fee -> position table shows custo de aquisicao **R$100.500** and preco medio **R$100.500/BTC** -> record a second buy 0,5 BTC for R$60.000 + R$300 fee -> preco medio becomes **R$107.200** -> sell 0,5 BTC -> quantity drops to 1,0 BTC, custo drops to **R$107.200**, preco medio stays **R$107.200** -> delete the sell -> position recomputes back to 1,5 BTC / R$160.800. All without a page refresh.

<objective>
Deliver Phase 1 end-to-end: a single-screen local web app (D-09) where the user records buy/sell crypto transactions through a modal (D-03), and immediately sees a per-coin position table (D-10) and a chronological transaction history showing the originating exchange (TX-03, TX-07). The mathematical backbone is a pure, deterministic ledger-replay position engine (POS-01/02/03) using Decimal.js for every arithmetic step — derived values (quantity, preco medio, custo de aquisicao) are NEVER stored, always recomputed from the full ledger so edit/delete are trivially correct (TX-04, TX-05).

Honors all 13 locked decisions: seeded + extendable coin list mapped to CoinGecko IDs (D-01, D-02); modal entry (D-03); buy as total-paid + separate fee summed into custo (D-04, TX-06); BRL default with optional USDT->BRL conversion stored permanently in BRL (D-05); historical rate -> current -> always-overridable fallback (D-06); sell-more-than-held blocked via chronological reconstruction (D-07, D-08); single-screen table layout (D-09, D-10); user-extendable exchange dropdown with a CNPJ-ready schema (D-11); delete confirmation + full recalculation on edit/delete (D-12); friendly empty state (D-13); full pt-BR formatting throughout (Claude's discretion).

Purpose: Establish the correctness foundation the whole product rests on. Phase 2 (market prices) plugs into coins.coingecko_id and the positions endpoint; Phase 3 (Bens e Direitos) plugs into the exchanges table (CNPJ added later without migration pain) and the same ledger-replay engine with an asOf date.
Output: A running `npm run dev` app + a fully unit-tested position engine + CRUD API + React UI. See "Artifacts This Phase Produces".
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@./.claude/CLAUDE.md
@.planning/phases/01-transaction-management-position-engine/01-CONTEXT.md
@.planning/phases/01-transaction-management-position-engine/01-RESEARCH.md
@.planning/phases/01-transaction-management-position-engine/01-SKELETON.md
</context>

---

## Wave Organization (MVP Vertical Slices)

Four internal waves. Each wave after Wave 0 delivers a complete usable vertical slice (form -> API -> DB -> position recalculation -> table re-render), not a horizontal layer. After each slice a real user can do something they could not do before.

| Wave | Slice delivered | New user capability |
| --- | --- | --- |
| 0 | Walking Skeleton + pure position engine (proven first) | App runs; seeded coins render from DB->API->UI; the tax math is fully unit-tested with no UI dependency |
| 1 | Record a BUY end-to-end | User records a buy in the modal and sees it in the history + position table with correct custo/preco medio |
| 2 | Record a SELL + currency conversion | User records a sell (qty/custo drop, preco medio unchanged), blocked if oversold; can enter a USDT value converted to BRL with override |
| 3 | Edit / delete + coin/exchange CRUD + verification | User edits and deletes transactions (all positions recompute), extends the coin/exchange lists, and the phase is verified against all 5 success criteria |

Tasks carry explicit per-task dependencies; the acyclic graph is in "Task Dependency Graph" below.

---

<tasks>

<task type="auto">
  <name>Task W0-1: Scaffold Vite+React+Hono+Vitest dev environment (est. 2h)</name>
  <files>package.json, vite.config.ts, vitest.config.ts, index.html, src/main.tsx, src/App.tsx, src/index.css, src/server/index.ts, .env.example, tsconfig.json</files>
  <read_first>./.claude/CLAUDE.md (Technology Stack — LOCKED versions; Installation; Version Compatibility); 01-RESEARCH.md (Validation Architecture); 01-SKELETON.md</read_first>
  <action>Scaffold from the Vite react-ts template, then install ONLY the exact locked stack from CLAUDE.md Technology Stack: React 19, Vite 6, TypeScript 5, Hono 4 + @hono/node-server 1, better-sqlite3 12.3 + @types/better-sqlite3, drizzle-orm 0.45 + drizzle-kit 0.30, decimal.js 10.6, @tanstack/react-query 5 + devtools, tailwindcss 4 + @tailwindcss/vite, vitest 3 + @testing-library/react + @testing-library/user-event, tsx 4, concurrently 9. Configure Tailwind v4 via the @tailwindcss/vite plugin (CSS-first, no tailwind.config.js). Create a minimal Hono server in src/server/index.ts served by @hono/node-server on port 3000 exposing GET /api/health returning a status ok object. Add a Vite dev proxy so the React app on 5173 forwards /api/* to 3000. Add npm scripts: dev runs Vite and the tsx --watch Hono server together via concurrently; plus build, test, test:run, seed, db:push. Run npm audit after install and record the result in the summary. Do not add any package outside the locked table.</action>
  <verify>
    <automated>npm run build && npm run test:run</automated>
  </verify>
  <acceptance_criteria>
    - npm run dev starts Vite (5173) and Hono (3000) concurrently with no errors.
    - curl of http://localhost:3000/api/health returns the status ok JSON.
    - npm run build produces a bundle; npm run test:run runs the empty Vitest suite green.
    - package.json contains only packages from the CLAUDE.md locked stack table.
  </acceptance_criteria>
  <done>Dev environment runs both processes; health endpoint responds; build + empty test suite pass; only locked packages installed.</done>
</task>

<task type="auto">
  <name>Task W0-2: Drizzle schema + SQLite client + seed (coins with coingecko_id, CNPJ-ready exchanges) (est. 2h)</name>
  <files>drizzle.config.ts, src/db/schema.ts, src/db/client.ts, src/db/seed.ts</files>
  <read_first>01-RESEARCH.md (Drizzle ORM Schema Design — full table definitions, seeded coins/exchanges, indexes); ./.claude/CLAUDE.md (Decimal Math — TEXT storage rule; Stack Patterns — origin column from day one); 01-CONTEXT.md (D-01, D-02, D-11)</read_first>
  <action>Define the Drizzle schema exactly as in RESEARCH Drizzle Schema Design. transactions: id, date (TEXT ISO YYYY-MM-DD), type buy or sell, coin_id FK, quantity/value_brl/fee_brl all TEXT (never REAL — preserves Decimal precision per CLAUDE.md), exchange_id FK, origin TEXT default manual (D-11 extensibility from day one), created_at/updated_at TEXT. coins: id, symbol unique, name, coingecko_id TEXT NOT NULL present from day one for Phase 2 (D-01), timestamps. exchanges: id, name unique, timestamps — design so a nullable cnpj column can be ADDed later without a destructive migration (D-11; CNPJ itself deferred to Phase 3, do NOT add it now). Add indexes on (coin_id, date) and (date, created_at) for the engine read path. Create src/db/client.ts wrapping better-sqlite3 with the Drizzle adapter (single-user synchronous driver). Create src/db/seed.ts that idempotently seeds ~20 top coins mapped to correct CoinGecko IDs (BTC to bitcoin, ETH to ethereum, USDT to tether, USDC to usd-coin, XRP to ripple, and more) and default exchanges (Manual, Binance, Kraken, Coinbase, Mercado Bitcoin). Wire drizzle.config.ts for drizzle-kit push.</action>
  <verify>
    <automated>npm run db:push &amp;&amp; npm run seed &amp;&amp; node -e "const d=require('better-sqlite3')('app.db');const c=d.prepare('select count(*) n from coins').get().n;const e=d.prepare('select count(*) n from exchanges').get().n;if(c&lt;15||e&lt;3)process.exit(1);console.log('coins',c,'exchanges',e)"</automated>
  </verify>
  <acceptance_criteria>
    - drizzle-kit push creates transactions, coins, exchanges tables; amount columns are TEXT (not REAL).
    - coins has a NOT NULL coingecko_id column and >=15 seeded rows; exchanges has >=3 seeded rows including Manual.
    - Indexes exist on (coin_id, date) and (date, created_at).
    - No cnpj column exists yet, but the exchanges table can gain a nullable cnpj via a plain ALTER (documented in the summary).
  </acceptance_criteria>
  <done>Schema pushed, seed populated, TEXT-amount + coingecko_id + origin conventions in place; verify script prints coin/exchange counts and exits 0.</done>
</task>

<task type="auto">
  <name>Task W0-3: Walking-skeleton vertical thread — coins/exchanges API + React renders seeded coins (est. 2h)</name>
  <files>src/server/routes/coins.ts, src/server/routes/exchanges.ts, src/server/index.ts, src/api/client.ts, src/main.tsx, src/App.tsx, src/index.css</files>
  <read_first>01-SKELETON.md (Capability Proven End-to-End); 01-RESEARCH.md (React Component Hierarchy, TanStack Query Integration); ./.claude/CLAUDE.md (@tanstack/react-query usage)</read_first>
  <action>Prove the full stack with the thinnest real thread. Backend: add GET /api/coins returning {id, symbol, name, coingecko_id} and GET /api/exchanges returning {id, name}, both reading live from SQLite via Drizzle; register them on the Hono app. Frontend: wrap the app in QueryClientProvider (staleTime 60s) in src/main.tsx with react-query-devtools; add a tiny typed fetch wrapper in src/api/client.ts; in src/App.tsx render a single-screen shell (page title, a placeholder for the position table on top and history below per D-09) and, as the skeleton proof, fetch GET /api/coins via useQuery and render the seeded coin symbols in a small list with visible loading and error states. Apply Tailwind base styling. This is the one real DB read surfaced in one real UI interaction (loading -> data). Leave clearly-marked mount points for PositionTable and TransactionHistory added in Wave 1.</action>
  <verify>
    <automated>npm run test:run &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - With the server running, opening the app shows the seeded coin symbols fetched from GET /api/coins (loading state visible first).
    - curl of /api/coins and /api/exchanges return JSON arrays sourced from SQLite.
    - App shell shows the single-screen layout skeleton (positions region on top, history region below) per D-09.
    - QueryClientProvider + devtools mounted; build passes.
  </acceptance_criteria>
  <done>DB -> API -> React round-trip works end-to-end; seeded coins render in the browser; single-screen shell in place with named mount points for Wave 1.</done>
</task>

<task type="auto" tdd="true">
  <name>Task W0-4: Pure position engine + sell validation with Decimal.js (est. 2.5h)</name>
  <files>src/engine/types.ts, src/lib/decimal.ts, src/engine/positionEngine.ts, src/engine/validation.ts</files>
  <read_first>01-RESEARCH.md (Position Engine Algorithm; Worked Example; Code Examples — Position Engine Core + Sell Validation; Common Pitfalls 1-5); .planning/REQUIREMENTS.md (POS-01, POS-02, POS-03); ./.claude/CLAUDE.md (Decimal Math)</read_first>
  <behavior>
    - calculatePositions(txs, asOf=now) is PURE: filters txs with date &lt;= asOf, groups by coin_id, replays chronologically (date asc, tie-break created_at asc), returns {coin_id, quantity, preco_medio, custo_total} Decimals. Derived values never persisted (POS-01).
    - BUY (POS-02, TX-06): custo_total += value_brl + fee_brl; quantity += qty; preco_medio = custo_total / quantity. Fee is summed into custo (never dropped, never added as literal 0).
    - SELL (POS-03): capture preco_medio from the PRE-SELL state (custo_total / quantity, BEFORE reducing quantity); then quantity -= qty; custo_total = preco_medio * remaining quantity. Unit preco_medio stays EXACTLY unchanged. Ordering matters: computing preco_medio AFTER reducing quantity inflates it and corrupts custo — do not reduce first. sell value_brl is inert for Phase 1 math.
    - validateSellTransaction(newSell, existing) replays coin txs in date order INCLUDING the candidate; returns {valid:false, reason} if holdings would go negative at ANY point (D-07/D-08), stricter than a net-total check.
    - Every arithmetic step uses Decimal.js via src/lib/decimal.ts helpers; native Number is never used for money/quantity.
  </behavior>
  <action>Implement src/engine/types.ts (Transaction, Position interfaces with TEXT string inputs and Decimal outputs), src/lib/decimal.ts (thin Decimal.js factory + helpers configured for >=8 dp), src/engine/positionEngine.ts (calculatePositions per the RESEARCH pseudocode + corrected code example — the sell branch MUST compute preco_medio from the pre-sell state before subtracting the sold quantity, per the &lt;behavior&gt; above; the W0-5 sell case is authoritative on the expected numbers), and src/engine/validation.ts (validateSellTransaction per RESEARCH code example). No I/O, no DB, no framework imports — pure functions only, so they are unit-testable before any UI or API exists.</action>
  <verify>
    <automated>npm run test:run -- src/engine</automated>
  </verify>
  <acceptance_criteria>
    - calculatePositions and validateSellTransaction are exported pure functions with no side effects or imports of db/server/React.
    - A quick REPL/import check computes the worked example (1 BTC @ R$100000 + R$500) to custo 100500, preco medio 100500.
    - All arithmetic routes through Decimal.js; no native Number math on amounts/quantities.
  </acceptance_criteria>
  <done>Engine + validation implemented as pure Decimal.js functions; tests added in W0-5 will lock behavior.</done>
</task>

<task type="auto" tdd="true">
  <name>Task W0-5: Position engine + pt-BR formatting unit tests (canonical cases) (est. 2.5h)</name>
  <files>src/engine/__tests__/positionEngine.test.ts, src/engine/__tests__/validation.test.ts, src/lib/format.ts, src/lib/__tests__/format.test.ts</files>
  <read_first>01-RESEARCH.md (Worked Example; Common Pitfalls 2-5; pt-BR Locale and Formatting; Validation Architecture — Phase Requirements to Test Map); 01-CONTEXT.md (Claude's Discretion — pt-BR formatting)</read_first>
  <behavior>
    - positionEngine.test.ts MUST include, at minimum: (a) worked example 1 BTC @ R$100000 + R$500 fee -> custo 100500, preco medio 100500 (ROADMAP criterion 4); (b) second buy 0,5 BTC @ R$60000 + R$300 -> preco medio 107200; (c) sell 0,5 BTC -> quantity 1,0, custo 107200, preco medio UNCHANGED 107200 (POS-03); (d) Decimal-precision case that fails with native floats: three buys summing R$333,33 each -> total exactly R$999,99 (Pitfall 2); (e) empty ledger -> empty positions; (f) asOf filter excludes later-dated txs.
    - validation.test.ts MUST include: chronological rejection — buy 1 BTC on 2026-07-10, sell 0,5 on 2026-07-05, sell 0,5 on 2026-07-05 -> second sell rejected even though net total is non-negative (D-08); oversell rejected; valid sell accepted.
    - format.test.ts: formatBRL(Decimal '1234.56') -> 'R$ 1.234,56'; formatQuantity('0.00314159') keeps 8 dp with comma decimal; parseBRLInput('1.234,56') -> Decimal 1234.56; parseQuantityInput('0,00314159') -> Decimal 0.00314159.
  </behavior>
  <action>Implement src/lib/format.ts (Intl.NumberFormat pt-BR display for BRL and quantities + comma-decimal input parsers on Decimal.js, per RESEARCH pt-BR Locale). Write the three test files covering every behavior above. These tests are the Wave 0 safety net that the ROADMAP correctness criteria (2 and 4) and the Brazilian rule depend on; they must exist and pass before any Wave 1 API work consumes the engine.</action>
  <verify>
    <automated>npm run test:run -- src/engine src/lib</automated>
  </verify>
  <acceptance_criteria>
    - All canonical cases (a)-(f), the three validation cases, and the four formatting cases pass.
    - The R$333,33 x3 test asserts exactly R$999,99 (would fail under native Number).
    - The sell test asserts preco medio is byte-for-byte unchanged after the sell.
    - Coverage for src/engine and src/lib is >=90%.
  </acceptance_criteria>
  <done>Engine, validation, and formatting are locked by passing unit tests including every canonical correctness case; the tax backbone is proven before UI.</done>
</task>

### Wave 1 — Record a BUY end-to-end (first usable slice)

<task type="auto" tdd="true">
  <name>Task W1-1: Buy API slice — POST /buy, GET /positions, GET /transactions + integration tests (est. 3h)</name>
  <files>src/server/routes/transactions.ts, src/server/routes/positions.ts, src/server/index.ts, src/server/__tests__/transactions.integration.test.ts</files>
  <read_first>01-RESEARCH.md (Architectural Responsibility Map; Position Engine Algorithm; Validation and Error Handling; Security Domain — parameterized queries); .planning/REQUIREMENTS.md (TX-01, TX-03, TX-06, TX-07, POS-01); 01-CONTEXT.md (D-04)</read_first>
  <behavior>
    - POST /api/transactions/buy accepts {date, coin_id, quantity, value_brl, fee_brl, exchange_id, origin?}; validates date not in future, quantity &gt; 0, required fields present; parses amounts as strings; inserts TEXT amounts via Drizzle parameterized query; returns 201 with the created row + recomputed positions (D-04, TX-01, TX-06). Fee stored separately and summed into custo by the engine (never at write time).
    - GET /api/positions loads all transactions and returns calculatePositions() output as STRING amounts joined with coin symbol/name (POS-01) — positions are computed, never read from a stored column.
    - GET /api/transactions returns all rows sorted by date asc then created_at asc, joined to coin + exchange names (TX-03, TX-07).
    - Invalid buy (missing coin, quantity 0, future date) -> 400 with a clear message; no internal state leaked (Security V7).
  </behavior>
  <action>Implement the buy + read endpoints in Hono, importing the pure engine from Wave 0. Register routes on src/server/index.ts. Write src/server/__tests__/transactions.integration.test.ts using an in-memory/temp SQLite DB: assert the worked-example buy returns custo 100500; GET /positions matches the engine; GET /transactions is chronologically sorted and includes the exchange name; invalid inputs return 400. Use Drizzle parameterized queries only (no string interpolation).</action>
  <verify>
    <automated>npm run test:run -- src/server</automated>
  </verify>
  <acceptance_criteria>
    - POST /buy with the worked example returns 201 and positions showing custo 100500 / preco medio 100500 (string amounts).
    - GET /transactions is sorted date asc + created_at asc and includes exchange + coin names.
    - GET /positions equals calculatePositions() over the same ledger (no DB-cached derived values).
    - Invalid buys return 400 with a safe message; integration tests green.
  </acceptance_criteria>
  <done>Buy write path + derived read endpoints work and are integration-tested against a real SQLite DB.</done>
</task>

<task type="auto">
  <name>Task W1-2: Buy UI slice — modal form, PositionTable, TransactionHistory, empty state, pt-BR (est. 3.5h)</name>
  <files>src/components/TransactionForm.tsx, src/components/PositionTable.tsx, src/components/TransactionHistory.tsx, src/components/CoinDropdown.tsx, src/components/ExchangeDropdown.tsx, src/components/EmptyState.tsx, src/hooks/useTransactions.ts, src/App.tsx</files>
  <read_first>01-RESEARCH.md (React Component Hierarchy; Component Responsibilities; TanStack Query Integration; pt-BR Locale — labels/headers); 01-CONTEXT.md (D-01, D-03, D-04, D-09, D-10, D-13); ./.claude/CLAUDE.md (shadcn/ui, TanStack Query)</read_first>
  <action>Build the buy slice UI (D-03 modal launched by a Nova transacao button). TransactionForm buy mode fields: Data, Moeda (CoinDropdown searchable, seeded list from GET /api/coins, returns coin.id — D-01), Quantidade, Valor Total (BRL), Taxa (separate field — D-04/TX-06), Exchange (ExchangeDropdown from GET /api/exchanges). Inputs accept comma-decimal and parse via src/lib/format.ts. On submit call a useCreateTransaction hook (useTransactions.ts) POSTing /buy, then invalidate ['positions'] and ['transactions'] so both tables re-render (no refresh). PositionTable (D-10): one row per coin — Moeda | Quantidade | Preco Medio | Custo Total, all pt-BR formatted; designed with room for Phase 2 market columns. TransactionHistory (TX-03/TX-07): Data | Tipo | Moeda | Quantidade | Valor | Taxa | Exchange | Acoes, chronological. EmptyState (D-13): when zero transactions, hide the tables and show a friendly message with a prominent Lancar primeira transacao button that opens the modal (no placeholder row). Wire all three into the App single-screen layout (D-09): positions on top, history below.</action>
  <verify>
    <automated>npm run test:run &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - Nova transacao opens the modal; recording the worked-example buy makes it appear in TransactionHistory and PositionTable WITHOUT a page refresh.
    - PositionTable shows the BTC row with Custo Total R$ 100.500,00 and Preco Medio R$ 100.500,00 (pt-BR format).
    - History rows are chronological and show the exchange name for every entry.
    - With zero transactions the EmptyState with Lancar primeira transacao is shown instead of empty tables.
    - CoinDropdown/ExchangeDropdown populate from the seeded lists.
  </acceptance_criteria>
  <done>User can record a buy through the modal and immediately see it reflected in both tables with correct pt-BR-formatted custo/preco medio; empty state present. Satisfies success criteria 1, 4, 5.</done>
</task>

### Wave 2 — Record a SELL + currency conversion (second usable slice)

<task type="auto" tdd="true">
  <name>Task W2-1: Sell API + chronological validation + CoinGecko rate fallback (D-06) + smoke test (est. 3h)</name>
  <files>src/server/routes/transactions.ts, src/server/coingecko.ts, src/server/routes/rate.ts, src/server/index.ts, src/server/__tests__/transactions.integration.test.ts</files>
  <read_first>01-RESEARCH.md (Sell Validation — Chronological Reconstruction; Historical Rate Lookup Feasibility — implementation path + fallback; Assumptions A1/A2); .planning/REQUIREMENTS.md (TX-02, POS-03); 01-CONTEXT.md (D-05, D-06, D-07, D-08)</read_first>
  <behavior>
    - POST /api/transactions/sell accepts {date, coin_id, quantity, value_brl (valor recebido, inert for Phase 1 math), fee_brl, exchange_id}; runs validateSellTransaction against the full ledger BEFORE insert; on negative-holdings-at-any-point returns 400 with the reason (D-07/D-08, TX-02); on success inserts and returns recomputed positions with preco medio unchanged (POS-03).
    - GET /api/rate?from=USDT&amp;date=YYYY-MM-DD returns {rate, source:'historical'|'current'|'unavailable'}: tries CoinGecko historical (/simple/price with date dd-mm-yyyy, vs_currencies=brl), falls back to current rate, and if both fail returns source 'unavailable' with rate null. It NEVER throws in a way that blocks the caller — the client always allows manual override (D-06). Stored custo de aquisicao is always BRL and never re-fetched afterward (D-05).
    - coingecko.ts reads COINGECKO_API_KEY if present, otherwise runs keyless; uses native fetch (no axios per CLAUDE.md).
  </behavior>
  <action>Implement the sell endpoint (reusing the Wave 0 validation function), src/server/coingecko.ts (getHistoricalRate + getCurrentRate with graceful fallback chain), and GET /api/rate. Extend the integration test file: sell reduces quantity and drops custo proportionally with preco medio unchanged; oversell and chronological-insert-oversell both return 400; a rate smoke test asserts GET /api/rate returns a numeric rate for a past date OR degrades to source 'unavailable' with rate null (network-independent — mock or tolerate offline) and never 500s. Run this smoke test early so a missing rate can never block transaction entry.</action>
  <verify>
    <automated>npm run test:run -- src/server</automated>
  </verify>
  <acceptance_criteria>
    - Selling more than held (including via an out-of-order earlier sell) returns 400 with a clear reason (D-07/D-08).
    - A valid sell returns positions with reduced quantity + proportionally reduced custo and BYTE-FOR-BYTE unchanged preco medio (POS-03).
    - GET /api/rate returns {rate, source} and, when CoinGecko is unavailable, returns source 'unavailable' + rate null without throwing/500.
    - No re-fetch of a stored transaction's BRL value ever occurs (D-05).
  </acceptance_criteria>
  <done>Sell path with chronological validation works; currency-conversion helper with historical->current->manual-override fallback is proven by a network-tolerant smoke test. Satisfies success criterion 2 (API side).</done>
</task>

<task type="auto">
  <name>Task W2-2: Sell UI + CurrencyInput (BRL/USDT toggle, rate display, manual override) (est. 2.5h)</name>
  <files>src/components/TransactionForm.tsx, src/components/CurrencyInput.tsx, src/hooks/useTransactions.ts</files>
  <read_first>01-RESEARCH.md (Component Responsibilities — TransactionForm sell tab, CurrencyInput; Open Questions 1 — sell received-value UI); 01-CONTEXT.md (D-04, D-05, D-06, D-07); 01-RESEARCH.md (pt-BR Locale — labels)</read_first>
  <action>Add sell mode to TransactionForm (Compra/Venda toggle): Data, Moeda, Quantidade, Valor Recebido (shown with a note that it is stored for a future capital-gains phase; inert in Phase 1 math), Taxa, Exchange. On submit POST /sell via the mutation hook; if the API returns 400 (oversell) show the reason inline below the quantity field (D-07). Build CurrencyInput used by the Valor Total field in buy mode (D-05/D-06): a BRL/USDT toggle defaulting to BRL; when USDT is selected it calls GET /api/rate for the transaction date, displays the fetched rate + a source/timestamp hint, shows the computed BRL amount, and ALWAYS exposes an editable BRL override field so a missing/failed rate never blocks entry. The value persisted is the resulting BRL amount only (never re-fetched later). Invalidate ['positions'] + ['transactions'] on success so tables re-render live.</action>
  <verify>
    <automated>npm run test:run &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - Recording a sell of 0,5 BTC after the two worked-example buys shows quantity 1,0 BTC, custo R$ 107.200,00, preco medio UNCHANGED at R$ 107.200,00 in the PositionTable, live.
    - Attempting to sell more than held shows the API reason inline; the transaction is not recorded (D-07).
    - Selecting USDT fetches and displays a rate + computed BRL and still allows a manual BRL override; with the rate endpoint unavailable the override alone lets the buy be recorded (D-06).
  </acceptance_criteria>
  <done>User records sells (with correct Brazilian-rule recomputation and oversell block) and can enter USDT-denominated buys converted to BRL with an always-available manual override. Satisfies success criterion 2 (UI side) and D-05/D-06.</done>
</task>

### Wave 3 — Edit / delete + coin/exchange CRUD + verification

<task type="auto" tdd="true">
  <name>Task W3-1: Edit/Delete API + add-coin/add-exchange + recalculation tests (est. 2.5h)</name>
  <files>src/server/routes/transactions.ts, src/server/routes/coins.ts, src/server/routes/exchanges.ts, src/server/index.ts, src/server/__tests__/transactions.integration.test.ts</files>
  <read_first>01-RESEARCH.md (Architectural Responsibility Map; Common Pitfall 1 — never store derived state); .planning/REQUIREMENTS.md (TX-04, TX-05); 01-CONTEXT.md (D-02, D-11, D-12)</read_first>
  <behavior>
    - PATCH /api/transactions/:id updates the row (re-validating a sell against the ledger) and returns recomputed positions from the full ledger (TX-04, D-12).
    - DELETE /api/transactions/:id removes the row and returns recomputed positions; if a coin has no remaining transactions its position row disappears (TX-05, D-12).
    - POST /api/coins {symbol, name, coingecko_id} adds a user coin (D-02); POST /api/exchanges {name} adds a user exchange (D-11). Both reject duplicates with 400.
    - All position numbers after edit/delete come from calculatePositions() over the current ledger — never from a stored column (Pitfall 1).
  </behavior>
  <action>Implement PATCH + DELETE for transactions and POST for coins + exchanges in Hono. Extend the integration test file: edit a buy quantity -> positions recompute; delete the Wave-2 sell -> position reverts to 1,5 BTC / custo 160.800 (proving full-ledger recomputation); delete the last transaction of a coin -> its position row disappears; POST duplicate coin/exchange -> 400.</action>
  <verify>
    <automated>npm run test:run -- src/server</automated>
  </verify>
  <acceptance_criteria>
    - PATCH and DELETE both return positions recomputed from the full ledger (no stale/cached derived values).
    - Deleting the sell restores the prior position exactly (1,5 BTC / R$160.800).
    - POST /api/coins and /api/exchanges add rows and reject duplicates with 400.
  </acceptance_criteria>
  <done>Edit/delete recompute all positions from the ledger and coin/exchange lists are user-extendable, all integration-tested. Satisfies success criterion 3 (API side) + D-02/D-11.</done>
</task>

<task type="auto">
  <name>Task W3-2: Edit/Delete UI + delete confirmation + add-coin/add-exchange inline (est. 2.5h)</name>
  <files>src/components/TransactionHistory.tsx, src/components/TransactionForm.tsx, src/components/DeleteConfirmDialog.tsx, src/components/CoinDropdown.tsx, src/components/ExchangeDropdown.tsx, src/hooks/useTransactions.ts</files>
  <read_first>01-RESEARCH.md (Component Responsibilities — TransactionHistory edit/delete; CoinDropdown/ExchangeDropdown add-new); 01-CONTEXT.md (D-02, D-11, D-12)</read_first>
  <action>Wire the Acoes column: an Editar button opens TransactionForm prefilled in edit mode -> PATCH; an Excluir button opens DeleteConfirmDialog (Tem certeza? per D-12) -> DELETE only on confirm. Both use mutation hooks that invalidate ['positions'] + ['transactions'] so both tables recompute live. Add an Adicionar moeda action at the bottom of CoinDropdown (inline form: symbol + name + coingecko_id -> POST /api/coins, D-02) and an Adicionar exchange action in ExchangeDropdown (name -> POST /api/exchanges, D-11); new entries appear immediately in the dropdowns.</action>
  <verify>
    <automated>npm run test:run &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - Editar prefills the modal; saving updates the row and both tables recompute live.
    - Excluir shows a confirmation dialog and only deletes on confirm; positions recompute immediately (D-12).
    - Adding a coin / exchange inline makes it selectable in the dropdown without a refresh (D-02/D-11).
  </acceptance_criteria>
  <done>Full transaction CRUD is usable from the UI with a delete confirmation, and the coin/exchange lists are extendable in-place. Satisfies success criterion 3 (UI side).</done>
</task>

<task type="auto">
  <name>Task W3-3: Verification, pt-BR/a11y polish, coverage + build gate (est. 2h)</name>
  <files>src/App.tsx, src/index.css, src/components/PositionTable.tsx, src/components/TransactionHistory.tsx, vitest.config.ts</files>
  <read_first>.planning/ROADMAP.md (Phase 1 — 5 Success Criteria); 01-RESEARCH.md (Validation Architecture — Phase Requirements to Test Map; Sampling Rate); 01-CONTEXT.md (Claude's Discretion — pt-BR)</read_first>
  <action>Final consistency + verification pass. Audit that every currency cell displays R$ 1.234,56 form and every quantity uses comma decimals up to 8 places across PositionTable and TransactionHistory. Add basic accessibility (form labels tied to inputs, keyboard-openable modal + dialog, focus management) and responsive layout for tablet width. Configure vitest coverage thresholds (>=80% for src/engine, src/lib, src/server). Produce the Success-Criteria -> test mapping evidence (see "Success Criteria to Tasks/Tests Map" below) and record it in the phase SUMMARY. Confirm the full run is green and the bundle builds clean.</action>
  <verify>
    <automated>npm run test:run &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - All 5 ROADMAP success criteria have a passing automated test or a documented UAT step in the mapping.
    - pt-BR formatting is consistent across all amount/quantity cells.
    - Coverage >=80% for engine/lib/server; build has no errors.
    - Forms have labels and the modal + delete dialog are keyboard-accessible.
  </acceptance_criteria>
  <done>Phase verified against all 5 success criteria, formatting and a11y polished, coverage + build gates green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task W3-4: Human end-to-end walkthrough of the success thread</name>
  <read_first>.planning/ROADMAP.md (Phase 1 — 5 Success Criteria); this plan's "Phase Goal" success thread</read_first>
  <what-built>Full Phase 1 app: modal buy/sell entry, single-screen position table + chronological history, edit/delete with recalculation, USDT->BRL conversion with override, pt-BR formatting.</what-built>
  <action>Pause autonomous execution and ask the developer to run the app and perform the 9-step walkthrough below, confirming each ROADMAP success criterion visually before the phase is marked complete. Do not proceed past this gate until the developer types "approved".</action>
  <how-to-verify>
    1. Run `npm run dev` and open http://localhost:5173.
    2. Empty state: confirm the "Lancar primeira transacao" button is shown (no example rows).
    3. Click it; record a BUY: 2026-07-01, BTC, quantidade 1, Valor Total R$100.000, Taxa R$500, exchange Binance. Submit.
    4. Confirm PositionTable shows BTC — Quantidade 1, Preco Medio R$ 100.500,00, Custo Total R$ 100.500,00; history shows the entry with the exchange.
    5. Record a second BUY: 0,5 BTC, R$60.000, Taxa R$300. Confirm Preco Medio becomes R$ 107.200,00.
    6. Record a SELL of 0,5 BTC. Confirm Quantidade 1,0, Custo Total R$ 107.200,00, Preco Medio UNCHANGED R$ 107.200,00.
    7. Try to SELL 5 BTC. Confirm it is blocked with a warning.
    8. Edit the first buy quantity, confirm positions recompute; delete the sell, confirm position reverts to 1,5 BTC / R$ 160.800,00.
    9. In the buy modal, toggle the value currency to USDT and confirm a rate + computed BRL appear and that you can override the BRL manually.
  </how-to-verify>
  <acceptance_criteria>
    - All 9 steps behave as described; amounts render in pt-BR; no page refresh needed for any update; no console errors.
  </acceptance_criteria>
  <resume-signal>Type "approved" or describe any discrepancies.</resume-signal>
</task>

</tasks>

---

## Task Dependency Graph (acyclic)

```
W0-1 (scaffold)
 ├─ W0-2 (schema+seed)
 │   └─ W0-3 (skeleton thread: coins API + React render)   [Walking Skeleton complete after W0-3]
 └─ W0-4 (engine + validation, pure)
     └─ W0-5 (engine + format unit tests)

W1-1 (buy API)         needs W0-2, W0-4, W0-5
W1-2 (buy UI)          needs W0-3, W1-1            [Slice 1: record a buy]

W2-1 (sell API + rate) needs W1-1, W0-4
W2-2 (sell UI + currency) needs W1-2, W2-1        [Slice 2: record a sell + conversion]

W3-1 (edit/delete + coin/exch API) needs W1-1
W3-2 (edit/delete + add UI)        needs W1-2, W2-2, W3-1   [Slice 3: full CRUD]
W3-3 (verification + polish)       needs W3-2
W3-4 (human walkthrough)           needs W3-3
```

No cycles. Wave 0 tasks may run partly in parallel (W0-2/W0-3 thread is independent of W0-4/W0-5 engine thread). Each subsequent wave completes one vertical slice.

---

## Success Criteria to Tasks/Tests Map

Every ROADMAP Phase 1 success criterion maps to concrete tasks AND a concrete test.

| # | ROADMAP Success Criterion | Delivered by | Proven by (test) |
| --- | --- | --- | --- |
| 1 | Record a buy (date, coin, qty, BRL, fee, exchange) and it appears in history | W1-1, W1-2 | `src/server/__tests__/transactions.integration.test.ts` (buy -> 201, GET /transactions includes it) + human step 3-4 |
| 2 | Sell drops qty + custo proportionally, preco medio EXACTLY unchanged | W0-4, W0-5, W2-1, W2-2 | `src/engine/__tests__/positionEngine.test.ts` (sell case c) + integration sell test + human step 6 |
| 3 | Edit or delete any transaction -> all positions recalculate immediately | W3-1, W3-2 | integration edit/delete recomputation tests (delete sell restores 1,5 BTC) + human step 8 |
| 4 | Position row shows qty/preco medio/custo; 1 BTC @ R$100k + R$500 = R$100.500 | W0-4, W0-5, W1-2 | `positionEngine.test.ts` worked-example case (a) + human step 4 |
| 5 | History chronological + shows originating exchange for every entry | W1-1, W1-2 | integration test (sorted date asc + exchange join) + human steps 4-5 |

Additional locked-behavior tests: chronological oversell rejection (D-07/D-08) in `validation.test.ts` + W2-1 integration; Decimal precision (R$333,33 x3 = R$999,99) in `positionEngine.test.ts`; CoinGecko fallback smoke test (D-06) in W2-1 integration.

---

## Artifacts This Phase Produces

**Database (src/db/):** `schema.ts` (tables: `transactions`, `coins`, `exchanges`; indexes `idx_transactions_coin`, `idx_transactions_date`), `client.ts` (better-sqlite3 + Drizzle), `seed.ts`.

**Engine + libs (src/engine/, src/lib/):** `types.ts` (Transaction, Position); `positionEngine.ts` -> `calculatePositions()`; `validation.ts` -> `validateSellTransaction()`; `lib/decimal.ts`; `lib/format.ts` (`formatBRL`, `formatQuantity`, `parseBRLInput`, `parseQuantityInput`).

**API (src/server/):** Hono app `index.ts`; routes — `POST /api/transactions/buy`, `POST /api/transactions/sell`, `PATCH /api/transactions/:id`, `DELETE /api/transactions/:id`, `GET /api/transactions`, `GET /api/positions`, `GET /api/coins`, `POST /api/coins`, `GET /api/exchanges`, `POST /api/exchanges`, `GET /api/rate`, `GET /api/health`; `coingecko.ts` (historical/current rate + fallback).

**UI (src/):** `App.tsx` (single-screen layout); components — `PositionTable`, `TransactionHistory`, `TransactionForm` (modal, buy+sell), `CoinDropdown`, `ExchangeDropdown`, `CurrencyInput`, `EmptyState`, `DeleteConfirmDialog`; `hooks/useTransactions.ts` (query + mutation hooks); `api/client.ts`.

**Tests:** `src/engine/__tests__/positionEngine.test.ts`, `src/engine/__tests__/validation.test.ts`, `src/lib/__tests__/format.test.ts`, `src/server/__tests__/transactions.integration.test.ts`.

**Config:** `package.json`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `.env.example` (COINGECKO_API_KEY optional).

---

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser (React) -> Hono API | User-supplied transaction data (amounts, dates, coin/exchange ids) crosses here; must be validated server-side |
| Hono API -> SQLite (Drizzle) | Financial PII persisted locally; parameterized access only |
| Hono API -> CoinGecko (outbound) | Untrusted external response for USDT->BRL rate; must degrade gracefully and never block entry |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-01 | Tampering | POST/PATCH transaction amount + date fields | high | mitigate | Server-side validation (quantity>0, date not future, required fields) + Drizzle parameterized queries; amounts parsed as Decimal strings, never interpolated (W1-1, W3-1) |
| T-01-02 | Tampering | Sell endpoint (negative holdings) | high | mitigate | Authoritative chronological `validateSellTransaction()` on the server before insert; client warning is advisory only (W2-1) |
| T-01-03 | Tampering | Decimal precision loss on money math | high | mitigate | Decimal.js for all arithmetic + TEXT storage; unit test 3 x R$333,33 = R$999,99 exactly (W0-5) |
| T-01-04 | Information Disclosure | API error responses | medium | mitigate | Return safe validation messages only; do not leak stack traces / internal state (V7) (W1-1) |
| T-01-05 | Denial of Service | CoinGecko outage/rate-limit blocking entry | medium | mitigate | Rate fallback historical->current->'unavailable' + always-available manual override; transaction entry never depends on the API (W2-1, W2-2) |
| T-01-06 | Information Disclosure | Local SQLite financial file | low | accept | Single-user local-first app; document restricting file perms (600) in the summary; no network exposure in Phase 1 (V8/V14) |
| T-01-SC | Tampering | npm dependency installs | high | mitigate | Install only the exact packages locked by the project owner in CLAUDE.md Technology Stack (owner-approved, all mainstream: React/Vite/Hono/Drizzle/better-sqlite3/decimal.js/TanStack Query/Tailwind/Vitest); run `npm audit` after install and report results; no package added outside the locked table (W0-1) |
</threat_model>

<verification>
- `npm run test:run` — full Vitest suite green (engine, validation, formatting, integration).
- Coverage >=80% for src/engine, src/lib, src/server (>=90% engine/lib).
- `npm run build` — clean production build, no errors.
- `npm run dev` — both processes start; app renders and is interactive with no console errors.
- Human walkthrough (W3-4) approves the 9-step success thread.
</verification>

<success_criteria>
Phase 1 is COMPLETE when:
- All 5 ROADMAP success criteria pass per the mapping table above (automated test + human step).
- The position engine is provably correct: worked example, sell-preserves-preco-medio, Decimal precision, and chronological oversell rejection all pass.
- CRUD (buy/sell/edit/delete) works end-to-end from the modal with live table recomputation and no stored derived values.
- USDT->BRL conversion degrades gracefully with a manual override (D-06); a missing rate never blocks entry.
- pt-BR formatting is consistent; coverage + build gates green; human checkpoint approved.
</success_criteria>

<output>
Create `.planning/phases/01-transaction-management-position-engine/01-01-SUMMARY.md` when done (record: npm audit result, coverage numbers, the Success-Criteria->test evidence, and the note that a nullable `cnpj` column can be ALTERed onto `exchanges` in Phase 3 without a destructive migration).
</output>
