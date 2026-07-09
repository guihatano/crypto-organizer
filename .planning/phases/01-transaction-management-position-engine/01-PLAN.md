---
phase: 01-transaction-management-position-engine
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - package.json
  - src/
  - prisma/ (or schema folder for Drizzle migrations)
  - .env.example
autonomous: true
requirements: [TX-01, TX-02, TX-03, TX-04, TX-05, TX-06, TX-07, POS-01, POS-02, POS-03]
must_haves:
  truths:
    - User can enter a buy transaction (date, coin, quantity, value BRL or USDT, fee, exchange) and immediately see it in the transaction history
    - User can enter a sell transaction; positions recalculate with the correct preço médio unchanged and custo de aquisição reduced proportionally
    - User can edit or delete any transaction and all positions recompute immediately from the full ledger
    - Per-coin position row shows quantity, preço médio, and custo de aquisição (with worked example: 1 BTC @ R$100k + R$500 fee = R$100,500 custo)
    - Transaction history displays in chronological order showing date, type, coin, quantity, value, fee, and exchange of origin
  artifacts:
    - "src/engine/positionEngine.ts" — pure function calculatePositions() that replays ledger
    - "src/engine/validation.ts" — validateSellTransaction() with chronological reconstruction
    - "src/server/routes/transactions.ts" — CRUD endpoints (POST buy/sell, PATCH edit, DELETE)
    - "src/server/routes/positions.ts" — GET /api/positions endpoint
    - "src/db/schema.ts" — Drizzle schema (transactions, coins, exchanges tables with TEXT for amounts)
    - "src/components/PositionTable.tsx" — displays per-coin summary
    - "src/components/TransactionHistory.tsx" — chronological list with edit/delete actions
    - "src/components/TransactionForm.tsx" — modal form for buy/sell entry
    - "src/utils/formatting.ts" — pt-BR Intl.NumberFormat and Decimal.js display/parse functions
  key_links:
    - "Position engine (pure ledger replay) → position read endpoint → PositionTable component" (must not cache positions in DB; always derived)
    - "Transaction form submit → CRUD endpoint (with sell validation) → DB insert → query cache invalidation → table re-render" (end-to-end flow)
    - "Modal form (CoinDropdown + ExchangeDropdown) → dropdowns fetch from GET /api/coins, /api/exchanges" (data dependencies)
    - "Decimal.js wrapping of TEXT database values → all arithmetic uses Decimal (never Number)" (correctness critical)
    - "USDT→BRL conversion (D-06) → CoinGecko historical rate at transaction date, fallback to current, always user-overridable" (currency conversion path)
---

## Phase Goal

Users can **record buy and sell transactions and immediately see their correct preço médio and custo de aquisição per coin**, computed per Brazilian tax rules using Decimal arithmetic. The phase delivers full transaction CRUD (create/edit/delete with immediate recalculation from the full ledger), a per-coin position view, and a chronological transaction history showing the originating exchange.

**Success:** User records 1 BTC buy for R$100,000 with R$500 fee → sees R$100,500 custo de aquisição → sells 0.5 BTC → sees remaining 0.5 BTC with unchanged preço médio but scaled custo → deletes the sell → positions recalculate back to original → all changes happen without page refresh.

---

## Overview

This plan delivers Phase 1 in four waves, ordered for parallel execution with minimal file conflicts:

- **Wave 0:** Project scaffold (Vite + Hono + SQLite), database schema, position engine core + unit tests
- **Wave 1:** API routes (transaction CRUD, positions query, coin/exchange dropdowns), form validation logic, CoinGecko historical rate test
- **Wave 2:** React components (PositionTable, TransactionHistory, modal form), form field bindings, pt-BR formatting integration
- **Wave 3:** Modal integration, empty state, TanStack Query setup, end-to-end smoke test, polish

Each wave delivers a thin vertical slice: **a working feature from UI → API → DB** by task completion. No "backend-only" waves — every task produces something a user can interact with (or a test exercises it).

---

## Architecture Snapshot

### Position Engine: Ledger Replay at Read Time

The position engine is a **pure, deterministic TypeScript function** that takes a list of transactions and returns per-coin positions. It never stores preço médio or custo de aquisição in the database; these are always **derived from the immutable transaction ledger at read time**.

```typescript
calculatePositions(transactions: Transaction[], asOf?: Date): Position[]
```

**Flow:**
1. Filter transactions by date (asOf parameter for future Bens e Direitos snapshots)
2. Group by coin_id
3. For each coin, replay in chronological order:
   - Buy: add quantity, sum into custo_total, recalculate unit preço_médio
   - Sell: subtract quantity, scale custo_total proportionally (preço_médio unchanged)
4. Return positions array

This ensures:
- Edit/delete a transaction → rerun the engine → all positions correct
- No mutable state to sync; correctness is deterministic
- Passed all unit tests before any UI integration

### Data Flow: Modal → API → Database → Query Cache → Table Update

```
User enters form → TransactionForm.onSubmit()
  ↓
POST /api/transactions/buy (or /sell)
  ↓
API validates: required fields, Decimal.js parsing, sell validation (chronological reconstruction)
  ↓
Insert transaction into SQLite (TEXT columns for amounts)
  ↓
API response: transaction + updated positions
  ↓
TanStack Query invalidates ['positions'] + ['transactions']
  ↓
Components refetch automatically
  ↓
PositionTable + TransactionHistory re-render with live data
```

### Key Patterns: Decimal.js, Ledger Replay, CoinGecko Async Rate Fetch

- **Decimal.js everywhere:** All monetary and quantity values are TEXT in SQLite, wrapped in `new Decimal()` on load, calculated with Decimal methods, formatted with `Intl.NumberFormat` for display.
- **Ledger-replay position engine:** No derived state stored; pure function replayed on every read.
- **CoinGecko historical rate fetch (D-06):** At transaction-entry time, if user enters non-BRL value, API fetches historical USDT→BRL rate for that date. Fallback to current rate if unavailable. User can always override manually.
- **pt-BR formatting from day one:** Input parser accepts comma as decimal; display uses dot for thousands, comma for decimals (R$ 1.234,56).
- **Chronological reconstruction for sell validation:** Before accepting a sell, replay the ledger in date order; block if holdings go negative at any point.

---

## Task Breakdown by Wave

### Wave 0: Foundation & Schema

Tasks that establish the project skeleton, database schema, and the core position engine logic (plus comprehensive unit tests).

| Task ID | Title | Estimate | Blockers | UAT Criteria |
| --- | --- | --- | --- | --- |
| T-1-W0-001 | Project scaffold: Vite + React + Hono + SQLite | 1.5h | None | `npm run dev` starts both Vite (port 5173) and Hono (port 3000) in parallel; `npm run build` produces optimized bundles; `npm run test` runs empty test suite |
| T-1-W0-002 | Drizzle schema: transactions, coins, exchanges tables | 1h | T-1-W0-001 | `npx drizzle-kit push` creates tables; inspect SQLite with `sqlite3 app.db ".schema"` to verify TEXT columns for amounts, indexes on (coin_id, date), foreign key references |
| T-1-W0-003 | Seed script: populate coins (BTC, ETH, USDT, etc.) and exchanges (Binance, Kraken, Manual) | 45m | T-1-W0-002 | `npm run seed` inserts 20 coins with CoinGecko IDs and 5 default exchanges; verify with `sqlite3 app.db "SELECT COUNT(*) FROM coins"` returns 20 |
| T-1-W0-004 | Position engine: calculatePositions() pure function with Decimal.js arithmetic | 2h | T-1-W0-001 | Function is exported and testable; no side effects; takes Transaction[] returns Position[] |
| T-1-W0-005 | Sell validation: validateSellTransaction() with chronological reconstruction | 1.5h | T-1-W0-001 | Function validates sell against all existing transactions; rejects if holdings go negative at any date; returns { valid, reason } |
| T-1-W0-006 | Unit tests (Wave 0): position engine, sell validation, Decimal.js arithmetic, pt-BR formatting | 3h | T-1-W0-004, T-1-W0-005 | `npm run test` runs >15 unit tests; coverage >90% for engine/ and validation/; includes worked example (1 BTC @ R$100k + R$500 fee = R$100,500 custo) |
| T-1-W0-007 | Utilities: Decimal.js and Intl.NumberFormat formatters (pt-BR), input parsers for BRL/quantity | 1h | T-1-W0-001 | Utility functions exported; test formatBRL(new Decimal('1234.56')) → 'R$ 1.234,56'; test parseBRL('1.234,56') → Decimal('1234.56') |

**Wave 0 Completion Criteria:**
- [ ] `npm run dev` starts both frontend and backend
- [ ] Database schema created with seed data
- [ ] Position engine unit tests all pass (>15 tests)
- [ ] All Decimal.js calculations verified exact (e.g., 3 × R$333.33 = exactly R$999.99, not R$999.9900000000001)
- [ ] Sell validation catches negative-holdings edge case (buy 1 BTC on 7-5, sell 0.5 on 7-10, sell 0.5 on 7-5 → second sell rejected)
- [ ] `npm run test` coverage report shows green for engine/, validation/

---

### Wave 1: API Routes & Form Validation Logic

Implement all transaction CRUD endpoints, the positions read endpoint, dropdown data endpoints, and currency conversion logic. No UI yet — all testable via REST calls.

| Task ID | Title | Estimate | Blockers | UAT Criteria |
| --- | --- | --- | --- | --- |
| T-1-W1-001 | API: POST /api/transactions/buy endpoint (creates transaction, validates, calls position engine, returns updated positions) | 1.5h | T-1-W0-*, T-1-W0-006 | `curl -X POST http://localhost:3000/api/transactions/buy -H 'Content-Type: application/json' -d '{"date":"2026-07-08","coin_id":1,"quantity":"1","value_brl":"100000","fee_brl":"500","exchange_id":1}'` returns 200 with position including custo R$100,500 |
| T-1-W1-002 | API: POST /api/transactions/sell endpoint (similar, includes sell validation before insert) | 1.5h | T-1-W1-001 | `curl -X POST /api/transactions/sell -d '{"date":"...","coin_id":1,"quantity":"0.5",...}'` returns 200; selling more than held returns 400 with reason; position recalculates with preço_médio unchanged |
| T-1-W1-003 | API: PATCH /api/transactions/:id endpoint (fetch by id, delete, reinsert with new values, recalculate all positions) | 1.5h | T-1-W1-001, T-1-W1-002 | `curl -X PATCH /api/transactions/1 -d '{"quantity":"2",...}'` returns 200; both PositionTable and TransactionHistory must invalidate cache |
| T-1-W1-004 | API: DELETE /api/transactions/:id endpoint (delete, recalculate positions, return updated state) | 1h | T-1-W1-003 | `curl -X DELETE /api/transactions/1` returns 200; positions for that coin recalculate; if last transaction deleted, coin row removed from positions |
| T-1-W1-005 | API: GET /api/positions endpoint (calls calculatePositions on all transactions, formats with Decimal.js, returns) | 1h | T-1-W1-001 | `curl http://localhost:3000/api/positions` returns JSON: `[{coin_id: 1, symbol: "BTC", quantity: "1", preco_medio: "100500", custo_total: "100500"}]`; all amounts are strings |
| T-1-W1-006 | API: GET /api/transactions endpoint (returns all transactions in date asc order, paginated or all) | 45m | T-1-W1-001 | `curl /api/transactions` returns array sorted by date asc, secondary by created_at; includes all fields (date, type, coin, qty, value, fee, exchange) |
| T-1-W1-007 | API: GET /api/coins, GET /api/exchanges endpoints (dropdown data sources) | 45m | T-1-W0-002 | `curl /api/coins` returns array of {id, symbol, name, coingecko_id}; `curl /api/exchanges` returns array of {id, name} |
| T-1-W1-008 | API: POST /api/coins (add new coin with CoinGecko ID), POST /api/exchanges (add new exchange) | 1h | T-1-W1-007 | `curl -X POST /api/coins -d '{"symbol":"DOGE","name":"Dogecoin","coingecko_id":"dogecoin"}'` returns 200; coin appears in GET /api/coins |
| T-1-W1-009 | Currency conversion helper: fetch historical USDT→BRL rate from CoinGecko for transaction date (D-06) | 1.5h | T-1-W0-001 | Helper function exported; test: fetch rate for 2026-07-01 returns number > 0; fallback to current rate if historical unavailable; smoke test validates endpoint works |
| T-1-W1-010 | Form validation functions (TypeScript): date not future, quantity > 0, required fields all present, Decimal.js parsing | 1h | T-1-W0-001 | Functions exported; test suite covers: valid buy (passes), missing coin (fails), quantity = 0 (fails), date in future (fails) |
| T-1-W1-011 | Integration tests (Wave 1): CRUD endpoints, position recalculation, sell validation edge case (chronological reconstruction) | 2h | T-1-W1-001 through T-1-W1-010 | `npm run test:integration` runs 10+ tests; all CRUD operations tested end-to-end with database; edge case: buy 7-10, sell 0.5 on 7-5, sell 0.5 on 7-05 → second sell rejected |

**Wave 1 Completion Criteria:**
- [ ] All CRUD endpoints respond and mutations update database correctly
- [ ] Position engine called after every transaction; positions accurate
- [ ] Sell validation blocks negative holdings (chronological reconstruction verified)
- [ ] CoinGecko historical rate fetch works or falls back gracefully
- [ ] Form validation functions reject invalid inputs
- [ ] Integration tests all pass; `npm run test:integration` green

---

### Wave 2: React Components & Form UI

Build the UI layer: PositionTable, TransactionHistory, TransactionForm modal, CoinDropdown, ExchangeDropdown, CurrencyInput. Wire to TanStack Query. Integrate pt-BR formatting.

| Task ID | Title | Estimate | Blockers | UAT Criteria |
| --- | --- | --- | --- | --- |
| T-1-W2-001 | Setup TanStack Query v5: install, QueryClientProvider in App.tsx, configure staleTime=60s, gcTime=10m | 45m | T-1-W0-001 | App.tsx renders QueryClientProvider wrapper; verify in React DevTools that query cache is present |
| T-1-W2-002 | PositionTable component: table with columns Symbol | Quantity | Preço Médio | Custo Total | fetches from GET /api/positions via TanStack Query | 1.5h | T-1-W2-001, T-1-W1-005 | Component renders rows for each coin holding; quantities and amounts display in pt-BR format (comma decimal); shows loading state; refetches on mutation |
| T-1-W2-003 | TransactionHistory component: table with columns Data | Tipo | Moeda | Quantidade | Valor | Taxa | Exchange | Ações | fetches from GET /api/transactions | 1.5h | T-1-W2-001, T-1-W1-006 | Rows display in chronological order; pt-BR formatting; edit/delete action buttons present; shows loading state |
| T-1-W2-004 | TransactionForm modal (buy tab): date input | coin dropdown | quantity input | value (BRL or USDT selector) | fee input | exchange dropdown | submit/cancel buttons | 2h | T-1-W2-001, T-1-W1-001 | Modal opens/closes; form fields bind to state; submit calls POST /api/transactions/buy; handles Decimal.js parsing of inputs (comma decimals) |
| T-1-W2-005 | TransactionForm modal (sell tab): date | coin | quantity | value-received (display only, Phase 2) | fee | exchange; sell validation feedback | 1h | T-1-W2-004 | Sell tab mirrors buy; form rejects sells that violate validation (API 400 error shown in form) |
| T-1-W2-006 | CoinDropdown component: searchable dropdown fetching from GET /api/coins, "add new coin" button at bottom | 1.5h | T-1-W2-001, T-1-W1-007 | Dropdown renders coin list; search filters by symbol/name; selection returns coin.id; "add coin" button opens lightweight form |
| T-1-W2-007 | ExchangeDropdown component: similar, fetches GET /api/exchanges, "add new exchange" button | 1h | T-1-W2-006, T-1-W1-007 | Dropdown renders exchange list; "add exchange" button opens form; selection returns exchange.id |
| T-1-W2-008 | CurrencyInput component: toggle BRL | USDT; if USDT selected, shows fetched rate + calculated BRL amount; manual override input | 1.5h | T-1-W2-001, T-1-W1-009 | Component renders radio or toggle for BRL/USDT; USDT triggers rate fetch; displays rate with timestamp; override input allows manual entry |
| T-1-W2-009 | Formatting utilities integration: pt-BR display (Intl.NumberFormat) and input parsing (comma→dot) in all form inputs and table cells | 1h | T-1-W2-002 through T-1-W2-008 | All currency fields display as R$ 1.234,56; all quantity fields display with comma decimal; user can type 1.234,56 and it parses correctly |
| T-1-W2-010 | TanStack Query mutation hooks: useCreateTransaction, useEditTransaction, useDeleteTransaction (each invalidates positions + transactions) | 1.5h | T-1-W2-001, T-1-W1-001 through T-1-W1-004 | Hooks exported; mutations integrate into form submit; on success, cache invalidates and tables refetch automatically |
| T-1-W2-011 | App.tsx layout: position table on top, transaction history below, "Nova transação" button floating or top-right | 1h | T-1-W2-002, T-1-W2-003 | Single-screen layout renders; button launches TransactionForm modal; responsive (works on tablet, not just desktop) |
| T-1-W2-012 | Component integration tests: form submission, error handling, dropdown selection, pt-BR formatting in rendered output | 1.5h | T-1-W2-002 through T-1-W2-011 | `npm run test` includes component tests; form submits, API error shows in UI, dropdown opens and selects, formatted values match locale |

**Wave 2 Completion Criteria:**
- [ ] App.tsx renders and is interactive (no console errors)
- [ ] PositionTable and TransactionHistory tables display sample data (manually seeded)
- [ ] TransactionForm modal opens/closes and form fields bind to state
- [ ] All input fields accept pt-BR format (comma decimals) and parse correctly
- [ ] All displayed amounts and quantities in pt-BR format
- [ ] TanStack Query DevTools shows query cache with correct keys
- [ ] Component tests pass; `npm run test` green for components/

---

### Wave 3: Modal Integration, Empty State, End-to-End Smoke Test, Polish

Final wave: wire up the form modal to the rest of the app, add the empty state UI, run end-to-end smoke tests, polish UX.

| Task ID | Title | Estimate | Blockers | UAT Criteria |
| --- | --- | --- | --- | --- |
| T-1-W3-001 | Wire TransactionForm modal: "Nova transação" button opens modal, form submit posts to API, on success closes modal + invalidates cache, form clears | 1.5h | T-1-W2-010, T-1-W2-011 | Button click opens modal; form submission succeeds; new transaction appears in table immediately; modal closes; button is clickable again |
| T-1-W3-002 | Edit mode: TransactionHistory edit button opens TransactionForm with prefilled fields; PATCH endpoint sends updated values; positions recalculate | 1.5h | T-1-W3-001, T-1-W1-003 | Edit button click opens modal with prefilled form; submit calls PATCH /api/transactions/:id; transaction updates in table |
| T-1-W3-003 | Delete confirmation dialog: delete button shows "Tem certeza?" confirmation; on confirm calls DELETE /api/transactions/:id; on cancel closes dialog | 1h | T-1-W3-002, T-1-W1-004 | Delete button triggers confirmation modal; confirming deletes transaction; transaction row removed from table |
| T-1-W3-004 | Empty state: with zero transactions, show friendly message "Nenhuma transação registrada" with prominent "Lançar primeira transação" button (D-13) | 1h | T-1-W2-002, T-1-W2-011 | When no transactions exist, position table hidden and empty state shown; button launches form; form submit hides empty state and shows table |
| T-1-W3-005 | CoinGecko historical rate smoke test: add integration test that fetches USDT→BRL for a past date, validates fallback to current rate | 45m | T-1-W1-009 | Test in Wave 3 smoke suite; endpoint responds with rate > 0; fallback to current rate if historical unavailable; no transaction is blocked by API failure |
| T-1-W3-006 | End-to-end smoke test: user records buy, sees it in table, edits it, sees change, sells half, sees position recalculated, deletes sell, sees original quantity restored | 1.5h | T-1-W3-001 through T-1-W3-005 | `npm run test:e2e` or manual walkthrough: record 1 BTC @ R$100k + R$500 fee; verify R$100,500 custo; sell 0.5; verify preço_médio unchanged, custo halved; delete sell; verify original position |
| T-1-W3-007 | Styling & UX polish: responsive layout (mobile/tablet), hover states, loading spinners, error toast notifications, accessibility (ARIA labels, keyboard nav) | 2h | T-1-W2-011 | App is usable on mobile viewport; form fields have labels; buttons are keyboard-accessible; errors shown clearly to user |
| T-1-W3-008 | Verification gate: all 5 ROADMAP success criteria tested (automated or manual); document in `.planning/phases/01-*/01-VERIFICATION.md` | 1h | All tasks | See success_criteria section below; each criterion has a test command or manual verification step |
| T-1-W3-009 | Final integration test suite: all CRUD operations, position engine accuracy, pt-BR formatting, CoinGecko rate fallback | 1h | All tasks | `npm run test` returns all tests green; coverage >80% for src/engine/, src/server/; `npm run build` succeeds with no warnings |

**Wave 3 Completion Criteria:**
- [ ] Modal form wired; submit, edit, delete all work end-to-end
- [ ] Empty state displays when no transactions; disappears after first entry
- [ ] CoinGecko historical rate test passes or falls back gracefully
- [ ] End-to-end user flow testable (record → edit → sell → delete → recalculate)
- [ ] App responsive and accessible
- [ ] All tests pass; coverage >80%
- [ ] Build succeeds; no console errors or warnings in dev mode
- [ ] All 5 ROADMAP success criteria have passing tests

---

## Rationale: Why This Wave Order?

1. **Wave 0 first:** Position engine is the correctness foundation. Unit tests validate the algorithm before any UI touches it. Schema is locked down; seed data is available for manual testing.

2. **Wave 1 parallelizable with Wave 0:** CRUD endpoints can be built as Wave 0 completes. Endpoints are tested via REST; no React needed yet. Form validation logic is pure functions, testable independently.

3. **Wave 2 parallelizable with Wave 1:** React components fetch from Wave 1 endpoints. TanStack Query wires the data flow. Components are built in isolation and integrated in Wave 3.

4. **Wave 3 last:** Modal integration and end-to-end flow depend on all other pieces. Smoke tests verify the whole system. Polish and accessibility happen last (low risk of breaking core logic).

**File conflicts minimized:** Wave 0 owns `src/engine/`, `src/db/`. Wave 1 owns `src/server/`. Wave 2 owns `src/components/`. Wave 3 updates `src/App.tsx` and runs tests. No two waves modify the same files.

---

## Task Dependency Graph

```
T-1-W0-001 (scaffold)
  ├─ T-1-W0-002 (schema) ── T-1-W0-003 (seed)
  ├─ T-1-W0-004 (position engine)
  │  └─ T-1-W0-005 (sell validation)
  │     └─ T-1-W0-006 (unit tests)
  └─ T-1-W0-007 (utilities)
     └─ T-1-W1-010 (form validation)
        └─ T-1-W2-004 (form component)

T-1-W1-001 (POST /buy)
  ├─ T-1-W1-002 (POST /sell)
  ├─ T-1-W1-003 (PATCH /:id)
  ├─ T-1-W1-004 (DELETE /:id)
  └─ T-1-W1-005 (GET /positions)
     └─ T-1-W2-002 (PositionTable)
        └─ T-1-W3-001 (wire modal)

T-1-W2-001 (TanStack Query setup)
  ├─ T-1-W2-002 (PositionTable)
  ├─ T-1-W2-003 (TransactionHistory)
  └─ T-1-W2-010 (mutation hooks)
     └─ T-1-W3-001 (wire modal)
```

---

## Execution Waves & Parallelization

| Wave | Concurrent Tasks | Estimated Duration | Dependency |
| --- | --- | --- | --- |
| **0** | T-1-W0-001, 002, 004, 007 (scaffold + core logic) | 4h | None |
| — | T-1-W0-003, 005, 006 (seed + validation + tests) | 3.5h | Wave 0 in progress |
| **1** | T-1-W1-001, 005, 007, 009, 010 (endpoints + utilities) | 5h | Wave 0 done |
| — | T-1-W1-002, 003, 004, 006, 008, 011 (more endpoints + integration tests) | 5.5h | Wave 1 in progress |
| **2** | T-1-W2-001, 006, 007 (setup + dropdowns) | 3h | Wave 1 done |
| — | T-1-W2-002, 003, 004, 005, 010 (tables + form) | 5h | Wave 2 in progress |
| — | T-1-W2-008, 009, 011, 012 (currency + formatting + layout + tests) | 5h | Wave 2 in progress |
| **3** | T-1-W3-001, 002, 003 (wire modal) | 4h | Wave 2 done |
| — | T-1-W3-004, 005, 006, 007, 008, 009 (empty state + tests + polish) | 6h | Wave 3 in progress |

**Total Estimate:** ~40h (1-week sprint at 8h/day). Assumes one developer working sequentially through waves; parallelization possible if multiple developers.

---

## Exit Criteria: Phase 1 Complete

Map each to the 5 ROADMAP success criteria:

### Success Criterion 1: User can record a buy transaction and it appears in the transaction history

- **Test:** Manual or automated end-to-end test
  ```bash
  npm run test:e2e 2>/dev/null | grep -c "buy.*appears.*history" || \
  (curl -X POST http://localhost:3000/api/transactions/buy \
    -d '{"date":"2026-07-08","coin_id":1,"quantity":"1","value_brl":"100000","fee_brl":"500","exchange_id":1}' && \
   sleep 1 && curl http://localhost:3000/api/transactions | grep -q "2026-07-08")
  ```
- **Done when:** New transaction visible in TransactionHistory table within 1 second of form submission; all fields (date, coin, qty, fee, exchange) display correctly

### Success Criterion 2: User can record a sell transaction; coin's quantity and custo drop, preço médio unchanged

- **Test:** Unit test of position engine + integration test of API
  ```bash
  npm run test -- src/engine/__tests__/sell-logic.test.ts 2>/dev/null | grep -q "sell.*preco_medio.*unchanged"
  ```
- **Done when:** Test passes; manual verification: record 1 BTC @ R$100k + R$500 fee (custo R$100,500), then sell 0.5 BTC; preço_médio remains R$100,500, custo drops to R$50,250

### Success Criterion 3: User can edit or delete any transaction; positions recalculate immediately

- **Test:** Integration test of PATCH + DELETE endpoints
  ```bash
  npm run test:integration 2>/dev/null | grep -c "edit.*delete.*recalculate"
  ```
- **Done when:** Edit changes transaction values and positions update; delete removes transaction and positions recalculate; both changes visible in UI within 1 second (TanStack Query refetch)

### Success Criterion 4: Per-coin position view shows quantity, preço médio, custo (worked example: 1 BTC @ R$100k + R$500 fee = R$100,500 custo)

- **Test:** Unit test of calculatePositions()
  ```bash
  npm run test -- src/engine/__tests__/position.test.ts 2>/dev/null | grep -q "1.*BTC.*100.*500.*custo"
  ```
- **Done when:** Test passes; PositionTable component renders row for BTC with custo_total = 100500; manual check: inspect table cell value

### Success Criterion 5: Transaction history in chronological order, showing originating exchange

- **Test:** Integration test of transaction listing
  ```bash
  npm run test:integration 2>/dev/null | grep -q "chronological.*exchange"
  ```
- **Done when:** TransactionHistory rows sorted by date ascending; exchange column populated from referenced exchanges table; manual check: insert 3 transactions out of date order, verify table sorts correctly

---

## Test Strategy

### Unit Tests (Wave 0, 1)

**Framework:** Vitest 3.x (zero-config with Vite)

**Test categories:**

1. **Position engine** (`src/engine/__tests__/position.test.ts`): Core algorithm
   - Buy 1 BTC @ R$100k + R$500 fee → quantity=1, custo=R$100,500, preço_médio=R$100,500 ✓
   - Buy 0.5 BTC @ R$60k + R$300 fee → quantity=1.5, custo=R$160,800, preço_médio=R$107,200 ✓
   - Sell 0.5 BTC → quantity=1.0, custo=R$107,200, preço_médio=R$107,200 (unchanged) ✓
   - Edge case: sell zero quantity → rejected ✓
   - Edge case: empty transaction list → empty positions array ✓

2. **Sell validation** (`src/engine/__tests__/validation.test.ts`): Chronological reconstruction
   - Buy 1 BTC on 7-10, sell 0.5 on 7-05, sell 0.5 on 7-05 → second sell rejected (negative holdings) ✓
   - Sell quantity greater than held → rejected ✓
   - Valid sell → accepted ✓

3. **Decimal.js correctness** (`src/engine/__tests__/decimal.test.ts`): Precision
   - 3 × R$333.33 = exactly R$999.99 (not R$999.9900000000001) ✓
   - 0.1 BTC + 0.05 BTC = 0.15 BTC ✓
   - R$1.01 + R$2.02 + R$3.03 = R$6.06 ✓

4. **Formatting** (`src/utils/__tests__/formatting.test.ts`): pt-BR locale
   - formatBRL('100000') → 'R$ 100.000,00' ✓
   - formatBRL('1234.56') → 'R$ 1.234,56' ✓
   - parseBRL('1.234,56') → Decimal('1234.56') ✓
   - parseQuantity('0,00314159') → Decimal('0.00314159') ✓

5. **Form validation** (`src/components/__tests__/validation.test.ts`): Input rules
   - quantity > 0 → valid ✓
   - quantity ≤ 0 → invalid ✓
   - date in future → invalid ✓
   - required fields empty → invalid ✓

### Integration Tests (Wave 1, 2, 3)

**Test framework:** Vitest + node fetch (no external server startup needed; API runs in-memory or via test database)

**Test categories:**

1. **CRUD endpoints** (`src/__tests__/transactions.integration.test.ts`)
   - POST /api/transactions/buy → 201, transaction in database ✓
   - POST /api/transactions/sell → 201 (valid) or 400 (invalid sell) ✓
   - PATCH /api/transactions/:id → 200, transaction updated ✓
   - DELETE /api/transactions/:id → 200, transaction removed ✓
   - GET /api/positions → 200, positions match position engine ✓
   - GET /api/transactions → 200, sorted by date asc ✓

2. **Position accuracy** (`src/__tests__/positions.integration.test.ts`)
   - After 3 buys, position engine matches expected custo and preço_médio ✓
   - After edit, positions recalculated ✓
   - After delete, positions recalculated ✓

3. **CoinGecko rate fetch** (`src/__tests__/coingecko.integration.test.ts`)
   - Fetch USDT→BRL for past date → returns number > 0 ✓
   - Historical unavailable → fallback to current rate ✓
   - Rate unavailable → user can override manually ✓

4. **Component rendering** (`src/components/__tests__/integration.test.ts`)
   - PositionTable renders rows for each coin ✓
   - TransactionHistory renders rows in date order ✓
   - Form submit creates transaction ✓
   - Edit button prefills form ✓
   - Delete button shows confirmation ✓

### End-to-End Smoke Test (Wave 3)

**Manual walkthrough or automated:**

1. Start app: `npm run dev`
2. Click "Nova transação" → modal opens ✓
3. Enter buy: date 2026-07-01, 1 BTC, R$100,000, fee R$500, Binance
4. Submit → position table shows 1 BTC, preço_médio R$100,500, custo R$100,500 ✓
5. Transaction history shows the buy entry ✓
6. Click edit → form prefills; change quantity to 1.2 BTC
7. Submit → position table updates to 1.2 BTC ✓
8. Click delete, confirm → position table reverts to 1 BTC ✓
9. Record sell: 0.5 BTC for R$55,000
10. Position table: 0.5 BTC, preço_médio R$100,500 (unchanged), custo R$50,250 ✓
11. Delete sell → position reverts to 1 BTC ✓

**Pass criteria:** All steps succeed; no console errors; UI responsive (< 1 second for actions).

---

## Known Risks & Mitigations

### Risk 1: Decimal.js Precision Loss in Edge Cases

**Risk:** Rounding errors in fractional crypto quantities (e.g., 0.00314159 BTC).

**Mitigation:** 
- Unit tests include extreme values (8 decimal places) 
- All SQLite storage is TEXT; parsing wraps in `new Decimal()` 
- All arithmetic uses Decimal methods (no toNumber() → Number operations)
- Test case: `3 × R$333.33 = R$999.99 exactly` (would fail if using Number)

### Risk 2: CoinGecko Historical Rate Unavailability (D-06)

**Risk:** API fails when user enters USDT value; transaction blocked.

**Mitigation:**
- Fallback to current rate (same API call without date param)
- Fallback to manual override (user can enter BRL amount directly)
- User can always record transaction without API; no hard dependency
- Smoke test in Wave 3 validates fallback path

### Risk 3: Sell Validation Not Catching Negative Holdings

**Risk:** Chronological reconstruction logic has bug; user sells more than held at some point in time.

**Mitigation:**
- Unit tests include edge case: buy 7-10, insert sell 7-05, insert sell 7-05 (second sell should be rejected)
- Integration test with real database
- Manual test: try to sell before a buy date

### Risk 4: Position Engine Stored in Database (Antipattern)

**Risk:** Positions cached in DB; edit/delete doesn't update cache; positions become stale.

**Mitigation:**
- Schema design does NOT include preço_médio or custo_total columns; only transactions table has raw data
- Position engine is a pure function: no side effects, no state
- Read endpoint calls position engine on every request (no DB cache)
- Integration tests verify edit/delete → recomputation

### Risk 5: pt-BR Formatting Breaks on Edge Values

**Risk:** Very large values (e.g., R$ 999,999,999.99) or very small (e.g., 0.00000001 BTC) format incorrectly.

**Mitigation:**
- Intl.NumberFormat is widely supported and tested
- Custom parser handles edge cases (commas, dots, scientific notation)
- Unit tests include boundary values

### Risk 6: Fee Not Included in Custo (Pitfall 3 from RESEARCH.md)

**Risk:** User records buy with fee, but fee is ignored in custo de aquisição.

**Mitigation:**
- Unit test: "1 BTC @ R$100k + R$500 fee = R$100,500 custo" is canonical
- Test fails if fee not summed
- API validation sums fee into transaction.value_brl before position calculation

### Risk 7: Modal Form Doesn't Close After Submit

**Risk:** User submits form, transaction created, but modal remains open and form doesn't clear.

**Mitigation:**
- Test: form submit success closes modal and clears fields
- TanStack Query mutation success callback triggers modal close
- Manual test: submit form, verify modal closes and button is clickable again

---

## Success Criteria Summary

**All of the following must be true for Phase 1 to be COMPLETE:**

1. ✓ User can record a buy transaction with date, coin, quantity, BRL amount, fee, exchange — it appears in transaction history
2. ✓ User can record a sell transaction; coin's quantity and custo drop proportionally, preço médio unchanged (Brazilian rule)
3. ✓ User can edit or delete any transaction and all positions recalculate immediately
4. ✓ Per-coin position row displays quantity, preço médio, custo de aquisição (worked example: 1 BTC @ R$100k + R$500 fee = R$100,500)
5. ✓ Transaction history in chronological order, showing originating exchange

**Testing checklist:**
- [ ] Unit tests: position engine, sell validation, Decimal.js, formatting — all pass, >90% coverage
- [ ] Integration tests: CRUD endpoints, positions, CoinGecko fallback — all pass
- [ ] Component tests: form, tables, dropdowns, modal — all pass
- [ ] End-to-end smoke test: record → edit → sell → delete → verify positions — manual pass
- [ ] Build succeeds: `npm run build` → no errors, optimized bundles created
- [ ] No console errors or warnings in dev mode

---

## Output Artifacts

Upon completion of Phase 1, the following files will exist:

**Backend:**
- `src/server/index.ts` — Hono app entry point, routes registration
- `src/server/routes/transactions.ts` — CRUD endpoints
- `src/server/routes/positions.ts` — positions endpoint
- `src/server/routes/coins.ts` — coins list and add endpoints
- `src/server/routes/exchanges.ts` — exchanges list and add endpoints
- `src/db/schema.ts` — Drizzle schema (transactions, coins, exchanges)
- `src/db/migrations/` — drizzle-kit generated migrations
- `src/engine/positionEngine.ts` — calculatePositions() pure function
- `src/engine/validation.ts` — validateSellTransaction()
- `src/engine/__tests__/` — unit tests

**Frontend:**
- `src/App.tsx` — main layout (PositionTable + TransactionHistory + "Nova transação" button)
- `src/components/PositionTable.tsx` — position summary table
- `src/components/TransactionHistory.tsx` — transaction list with edit/delete
- `src/components/TransactionForm.tsx` — modal form for buy/sell entry and edit
- `src/components/CoinDropdown.tsx` — searchable coin selector
- `src/components/ExchangeDropdown.tsx` — searchable exchange selector
- `src/components/CurrencyInput.tsx` — BRL/USDT toggle with rate display
- `src/components/__tests__/` — component unit tests
- `src/utils/formatting.ts` — Intl.NumberFormat display + Decimal.js parsers (pt-BR)
- `src/utils/coingecko.ts` — historical rate fetch helper
- `src/__tests__/` — integration tests

**Configuration:**
- `package.json` — updated with all dependencies (Decimal.js, Drizzle, better-sqlite3, TanStack Query, Vitest, etc.)
- `.env.example` — CoinGecko API key (optional for Demo tier)
- `vite.config.ts` — Vite config with React plugin
- `vitest.config.ts` — Vitest config with coverage thresholds

**Documentation:**
- `.planning/phases/01-transaction-management-position-engine/01-VERIFICATION.md` — test evidence for all 5 success criteria

---

## Next Phase Gate

**Before proceeding to Phase 2 (Portfolio Dashboard + Market Prices):**

1. Verify all 5 ROADMAP Phase 1 success criteria are tested and passing
2. Check: position engine is provably correct (unit tests, edge cases, worked example)
3. Check: CoinGecko historical rate fetch works or falls back gracefully
4. Check: pt-BR formatting is consistent across all fields
5. Review: VERIFICATION.md documents test evidence for each criterion

**Phase 2 will plug into:**
- Coins table's coingecko_id column (already present, seeded in Phase 1)
- Positions endpoint (will be enriched with live prices)
- TanStack Query caching layer (will add price polling)

---

*Phase 1 Plan created: 2026-07-08*
*Planned completion: 40 hours (1-week sprint)*
*Mode: mvp (vertical slices, end-to-end per wave)*
