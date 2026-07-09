---
phase: 01-transaction-management-position-engine
plan: 01
subsystem: full-stack
tags: [react, hono, drizzle, better-sqlite3, decimal.js, tanstack-query, tailwindcss-v4, vitest, coingecko]

# Dependency graph
requires: []
provides:
  - "Pure, Decimal.js-backed position engine (calculatePositions) implementing the Brazilian preco medio rule"
  - "Chronological sell validation (validateSellTransaction) rejecting oversells at any point in the ledger timeline"
  - "SQLite schema (transactions/coins/exchanges) with TEXT amounts, coingecko_id, origin, nullable exchange_id"
  - "Full CRUD API: buy/sell/edit/delete transactions, add coin/exchange, positions, historical/current rate lookup with manual-override fallback"
  - "React UI: modal transaction entry (buy/sell), position table, chronological history, edit/delete, inline add-coin/exchange, BRL/USDT currency toggle with live money-mask formatting"
  - "pt-BR display conventions: BRL amounts comma-decimal with R$ prefix; crypto quantities dot-decimal at exactly 8 places (international convention)"
affects: [02-portfolio-dashboard-market-prices, 03-bens-e-direitos-tax-report]

# Tech tracking
tech-stack:
  added: [react@19, vite@6, typescript@5, hono@4, "@hono/node-server@1", better-sqlite3@12.3, drizzle-orm@0.45, drizzle-kit@0.30, decimal.js@10.6, "@tanstack/react-query@5.101", "@tanstack/react-query-devtools", tailwindcss@4.3, "@tailwindcss/vite", vitest@3, "@vitest/coverage-v8", tsx@4, concurrently@9, "@testing-library/react", "@testing-library/user-event", jsdom]
  patterns:
    - "Position engine is pure (no I/O, no DB, no framework imports) — replays the full ledger on every read, never persists derived values"
    - "TEXT columns for all money/quantity amounts; every arithmetic step routes through Decimal.js (src/lib/decimal.ts), never native Number"
    - "Two distinct display formatters: formatBRL/formatMoneyPtBR (pt-BR comma-decimal, for money) vs formatQuantity (dot-decimal, exactly 8dp, international, for crypto quantities) — never interchanged"
    - "Live money-mask input pattern (maskMoneyInput): re-derives pt-BR display + normalized decimal from the full current input string on every keystroke, correct for both insertion and deletion"
    - "API routes return safe, user-facing pt-BR error messages only — never leak stack traces or internal state"
    - "Every mutation (buy/sell/patch/delete) returns positions recomputed via the same computeSerializedPositions() code path — single source of truth"

key-files:
  created:
    - src/engine/positionEngine.ts
    - src/engine/validation.ts
    - src/engine/types.ts
    - src/lib/decimal.ts
    - src/lib/format.ts
    - src/db/schema.ts
    - src/db/client.ts
    - src/db/seed.ts
    - src/server/index.ts
    - src/server/routes/transactions.ts
    - src/server/routes/positions.ts
    - src/server/routes/coins.ts
    - src/server/routes/exchanges.ts
    - src/server/routes/rate.ts
    - src/server/coingecko.ts
    - src/components/TransactionForm.tsx
    - src/components/CurrencyInput.tsx
    - src/components/PositionTable.tsx
    - src/components/TransactionHistory.tsx
    - src/components/CoinDropdown.tsx
    - src/components/ExchangeDropdown.tsx
    - src/components/EmptyState.tsx
    - src/components/DeleteConfirmDialog.tsx
    - src/hooks/useTransactions.ts
    - src/api/client.ts
  modified:
    - package.json
    - vite.config.ts
    - vitest.config.ts
    - App.tsx

key-decisions:
  - "Custom lightweight Tailwind components instead of shadcn/ui CLI — kept dependency surface within CLAUDE.md's locked stack table (shadcn is listed as optional/discretionary)"
  - "Omitted @testing-library/react + jsdom in initial scaffold (W0-1) per strict locked-stack reading; reversed this decision mid-plan (Rule 1/2) after a UAT-caught component-wiring bug (CurrencyInput) proved unit tests on format.ts alone could not catch it — added a targeted regression test"
  - "Exchange changed from required to optional mid-plan (explicit product decision during human UAT, relaxing the original TX-07/D-11 framing) — exchange_id is nullable in the schema, GET /transactions uses LEFT JOIN, UI never blocks submission on it"
  - "Crypto quantities render in the international dot-decimal, exactly-8-place format (e.g. 1.00000000), deliberately distinct from pt-BR comma-decimal BRL money display — caught and fixed after UAT flagged the initial (incorrect) pt-BR quantity formatting"
  - "Live pt-BR money-mask formatting (digit-extraction, cents-based) applied to all BRL text inputs (Valor Total, Taxa, Valor recebido) for consistent typing UX — added during UAT polish, no change to underlying Decimal.js math"

patterns-established:
  - "Pattern: engine/lib layers have zero framework/DB imports — fully unit-testable in isolation, proven before any API or UI code touches them (Wave 0 walking skeleton)"
  - "Pattern: server route validation returns {error: string} with safe pt-BR messages and correct HTTP status; never a raw thrown exception reaches the client"
  - "Pattern: every write endpoint (buy/sell/patch/delete) recomputes and returns positions via the same shared computeSerializedPositions()/loadLedger() helpers in positions.ts"
  - "Pattern: TanStack Query mutations invalidate ['positions'] and ['transactions'] on success — both tables re-render live with no manual refetch or page refresh"

requirements-completed: [TX-01, TX-02, TX-03, TX-04, TX-05, TX-06, TX-07, POS-01, POS-02, POS-03]

coverage:
  - id: D1
    description: "Position engine correctly implements the Brazilian preco medio rule: buy recomputes weighted average (fee summed into custo), sell preserves preco medio exactly unchanged while custo drops proportionally"
    requirement: "POS-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/positionEngine.test.ts — worked example, second buy, sell-preserves-preco-medio, Decimal-precision cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sell validation rejects oversells at any chronological point in the ledger, not just on final net total (D-07/D-08)"
    requirement: "POS-03"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/validation.test.ts — chronological rejection, simple oversell, valid sell"
      - kind: integration
        ref: "src/server/__tests__/transactions.integration.test.ts — POST /transactions/sell oversell + chronological oversell 400 cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "Buy/sell/edit/delete recorded through the modal UI immediately reflect in PositionTable and TransactionHistory with correct pt-BR/quantity formatting, no page refresh"
    requirement: "TX-01"
    verification:
      - kind: integration
        ref: "src/server/__tests__/transactions.integration.test.ts — full CRUD suite (buy/sell/patch/delete)"
        status: pass
      - kind: manual_procedural
        ref: "W3-4 9-step human walkthrough (3 rounds — logic, currency-format/USDT-calc fixes, cursor/exchange-optional/live-masking polish)"
        status: pass
    human_judgment: true
    rationale: "Live UI rendering, formatting, and interaction flow require human visual confirmation — already performed and approved in this session (W3-4 checkpoint, round 3)"
  - id: D4
    description: "Editing or deleting a transaction recomputes all positions from the full ledger — deleting the Wave-2 sell restores 1,5 BTC / R$160.800 exactly"
    requirement: "TX-04"
    verification:
      - kind: integration
        ref: "src/server/__tests__/transactions.integration.test.ts — PATCH/DELETE recomputation suite"
        status: pass
    human_judgment: false
  - id: D5
    description: "USDT->BRL conversion (D-06): historical -> current -> manual-override fallback never blocks entry even when CoinGecko is unreachable; computed amount correctly propagates to the form (fixed a UAT-caught wiring bug)"
    requirement: "TX-06"
    verification:
      - kind: unit
        ref: "src/components/__tests__/CurrencyInput.test.tsx — auto-calc propagation + manual override + unavailable-rate path"
        status: pass
      - kind: integration
        ref: "src/server/__tests__/transactions.integration.test.ts — GET /api/rate smoke tests (mocked fetch, network-independent)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Transaction history is chronological and shows the originating exchange for every entry that has one; exchange is optional and a missing one displays gracefully"
    requirement: "TX-07"
    verification:
      - kind: integration
        ref: "src/server/__tests__/transactions.integration.test.ts — GET /transactions sort + LEFT JOIN null-exchange cases"
        status: pass
    human_judgment: false

# Metrics
duration: ~50min active engineering across 3 sessions (initial 12-task execution + 2 human-UAT bugfix rounds; wall-clock 425613c to 2ef0192 spans ~10h including checkpoint wait time for human review)
completed: 2026-07-09
status: complete
---

# Phase 1 Plan 01: Transaction Management + Position Engine Summary

**Pure Decimal.js position engine implementing the Brazilian preco medio rule, full buy/sell/edit/delete CRUD via Hono + Drizzle + SQLite, and a React/TanStack Query UI with pt-BR money formatting and CoinGecko USDT->BRL conversion — verified through a 3-round human UAT walkthrough.**

## Performance

- **Duration:** ~50min active engineering (3 sessions: initial 12-task execution ~29min, then 2 short UAT bugfix rounds); wall-clock span (first to last commit) ~10h due to checkpoint waits for human review between rounds
- **Started:** 2026-07-08T23:50:34-03:00 (first task commit, W0-1)
- **Completed:** 2026-07-09T09:46:32-03:00 (final bugfix commit, approved)
- **Tasks:** 12 planned auto tasks (W0-1 through W3-3) + 2 human-UAT bugfix rounds + 1 human-verify checkpoint (W3-4, approved on the 3rd presentation)
- **Files modified:** 48 (create-vite scaffold + all engine/db/server/component/test files)

## Accomplishments

- Pure position engine (`calculatePositions`) correctly implements the Brazilian rule: sell preserves preco medio byte-for-byte while custo drops proportionally; buy recomputes the weighted average including fee. Locked by unit tests including the R$333,33 x3 = R$999,99 Decimal-precision case that would fail under native floats.
- Chronological sell validation (`validateSellTransaction`) rejects an oversell at ANY point in the timeline — stricter than a net-total check, proven by the D-08 out-of-order scenario (buy after an earlier sell).
- Full transaction CRUD (buy/sell/edit/delete) with positions always recomputed from the live ledger, never cached — deleting a sell restores the exact pre-sell position.
- CoinGecko historical -> current -> manual-override rate fallback for USDT->BRL conversion; never blocks entry even when the API is unreachable.
- pt-BR UI throughout: BRL amounts (R$ 1.234,56, comma-decimal, live-masked as you type) vs crypto quantities (1.00000000, dot-decimal, international convention) are deliberately distinct formatters, never interchanged.
- Exchange is optional (product decision made during UAT) — schema, API, and UI all relaxed without breaking existing behavior.
- Empty state, delete confirmation, inline add-coin/add-exchange, and full keyboard/label accessibility.
- 47 automated tests (engine, validation, formatting, integration, one targeted component regression test) all passing; coverage thresholds enforced in CI config (engine 92.7%, lib 100%, server 88.73%, all above the 80% gate).

## Task Commits

Each task was committed atomically:

1. **Task W0-1: Scaffold Vite+React+Hono+Vitest dev environment** - `425613c` (feat)
2. **Task W0-2: Drizzle schema + SQLite client + seed** - `5c2df66` (feat)
3. **Task W0-3: Walking-skeleton vertical thread (coins/exchanges API + React render)** - `7e410ff` (feat)
4. **Task W0-4: Pure position engine + sell validation with Decimal.js** - `0e29014` (feat)
5. **Task W0-5: Position engine + pt-BR formatting unit tests** - `1186e7b` (test)
6. **Task W1-1: Buy API slice** - `3d8ccfe` (feat)
7. **Task W1-2: Buy UI slice** - `50c0561` (feat)
8. **Task W2-1: Sell API + CoinGecko rate fallback** - `18d11b3` (feat)
9. **Task W2-2: Sell UI + CurrencyInput** - `514aa35` (feat)
10. **Task W3-1: Edit/Delete API + add-coin/add-exchange** - `666995e` (feat)
11. **Task W3-2: Edit/Delete UI + delete confirmation + inline add** - `bd601b8` (feat)
12. **Task W3-3: Verification, pt-BR/a11y polish, coverage gate** - `56c74a8` (test)
13. **Bugfix round 1 (human UAT): quantity dot-format + USDT auto-calc wiring** - `17035e6` (fix)
14. **Bugfix round 2 (human UAT): cursor styling, exchange optional, live BRL masking** - `2ef0192` (fix)

**Plan metadata:** this SUMMARY.md commit (docs: complete plan)

## Files Created/Modified

- `src/lib/decimal.ts` - Decimal.js factory configured for >=8dp precision
- `src/lib/format.ts` - formatBRL/formatMoneyPtBR (pt-BR money), formatQuantity (international dot+8dp quantity), maskMoneyInput (live money-mask), parseBRLInput/parseQuantityInput (lenient dual-format parsing)
- `src/engine/types.ts`, `positionEngine.ts`, `validation.ts` - pure, framework-free position engine + chronological sell validation
- `src/db/schema.ts` - transactions (nullable exchange_id)/coins/exchanges tables, TEXT amounts, indexes
- `src/db/client.ts`, `seed.ts` - better-sqlite3 + Drizzle client, idempotent seed (20 coins, 5 exchanges)
- `src/server/index.ts` + `routes/{transactions,positions,coins,exchanges,rate}.ts` - Hono API, all CRUD + rate lookup
- `src/server/coingecko.ts` - historical/current rate fetch with graceful fallback
- `src/components/*.tsx` - TransactionForm (modal, buy/sell, edit mode), CurrencyInput (BRL/USDT toggle + live mask), PositionTable, TransactionHistory, CoinDropdown, ExchangeDropdown, EmptyState, DeleteConfirmDialog
- `src/hooks/useTransactions.ts` - TanStack Query hooks for all reads/mutations
- `src/api/client.ts` - typed fetch wrapper + shared response types
- Test files: `src/engine/__tests__/*.test.ts`, `src/lib/__tests__/format.test.ts`, `src/server/__tests__/transactions.integration.test.ts` + `testDb.ts`, `src/components/__tests__/CurrencyInput.test.tsx`

## Decisions Made

- Built lightweight custom Tailwind components instead of the shadcn/ui CLI, keeping the dependency surface within CLAUDE.md's explicitly locked package table (shadcn is a discretionary recommendation, not mandatory).
- Reversed the initial decision to omit `@testing-library/react`/jsdom (made during W0-1 for strict locked-stack minimalism) after a UAT-caught bug proved a pure-unit-test strategy on `format.ts` alone couldn't catch component-level state-wiring bugs — added them specifically to regression-test the CurrencyInput fix.
- Made exchange optional (not required) mid-plan — an explicit product decision from the human during UAT, relaxing the plan's original TX-07/D-11 framing ("shows the originating exchange for every entry"). Schema migrated to nullable `exchange_id` via `drizzle-kit push` (pre-launch, no production data to preserve).
- Crypto quantities and BRL money amounts use two deliberately different formatters (dot-decimal international vs pt-BR comma-decimal) — this distinction was not explicit in the original plan and was corrected after human UAT caught quantities incorrectly rendering pt-BR.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `node` TypeScript types for server code**
- **Found during:** Task W0-1 (scaffold build verification)
- **Issue:** `tsc -b` failed on `process.env`/`process.exit` references in `src/server/index.ts` — the scaffolded `tsconfig.app.json` only included `vite/client` types
- **Fix:** Added `"node"` to the `types` array
- **Files modified:** tsconfig.app.json
- **Verification:** `npm run build` passes
- **Committed in:** 425613c (Task W0-1 commit)

**2. [Rule 3 - Blocking] Added `passWithNoTests: true` to vitest config**
- **Found during:** Task W0-1 (empty-suite acceptance criterion)
- **Issue:** Vitest exits 1 by default when no test files exist yet, which would fail the "empty suite runs green" acceptance criterion before any tests were written
- **Fix:** Added the config flag
- **Files modified:** vitest.config.ts
- **Committed in:** 425613c (Task W0-1 commit)

**3. [Rule 3 - Blocking] Installed `@vitest/coverage-v8` devDependency**
- **Found during:** Task W0-5 (coverage acceptance criterion)
- **Issue:** `npx vitest run --coverage` failed with a missing-dependency error — the coverage provider isn't bundled with vitest core
- **Fix:** Installed the matching-major (3.2.7) companion package
- **Files modified:** package.json, package-lock.json
- **Committed in:** 1186e7b (Task W0-5 commit)

**4. [Rule 1 - Bug, human-UAT-caught] Crypto quantity display used pt-BR comma format instead of international dot format**
- **Found during:** W3-4 human walkthrough, round 1
- **Issue:** `formatQuantity()` routed through `Intl.NumberFormat('pt-BR', ...)`, rendering crypto quantities as `1,00000000` instead of the standard `1.00000000`
- **Fix:** Rewrote `formatQuantity` to use `Decimal#toFixed(8)` directly; split the old pt-BR-comma behavior into a dedicated money formatter (`formatMoneyPtBR`, later refined further in round 2) for the legitimate remaining case (editable BRL field prefill); made `parseQuantityInput` lenient to both dot and comma decimal input
- **Files modified:** src/lib/format.ts, src/lib/__tests__/format.test.ts, src/components/TransactionForm.tsx, src/components/CurrencyInput.tsx
- **Verification:** Updated/new format.test.ts cases; live end-to-end check against the dev server
- **Committed in:** 17035e6

**5. [Rule 1 - Bug, human-UAT-caught] USDT auto-computed BRL value never reached form state**
- **Found during:** W3-4 human walkthrough, round 1
- **Issue:** CurrencyInput's USDT*rate auto-compute effect called `setBrlDisplay()` directly instead of `emitBrl()`, updating only the visible text — `onChangeBrl` (and therefore the parent form's `value_brl`) never fired, so the required-field check blocked submission even though a number was showing
- **Fix:** Changed the effect to call `emitBrl()`; added `src/components/__tests__/CurrencyInput.test.tsx`, verified it fails against the pre-fix code (reproducing the exact bug) and passes with the fix
- **Files modified:** src/components/CurrencyInput.tsx
- **Verification:** New regression test (2 cases); confirmed failing-then-passing against a manual revert; live rate check against real CoinGecko
- **Committed in:** 17035e6

**6. [Rule 1/2 - UI polish, human-UAT-caught] Cursor pointer missing on all clickable buttons**
- **Found during:** W3-4 human walkthrough, round 2
- **Issue:** Tailwind v4 preflight resets `button` cursor to `default`; no component explicitly set `cursor-pointer`
- **Fix:** Added `cursor-pointer` (+ `disabled:cursor-not-allowed` on disabled submit/save buttons) to every button across all 8 components
- **Files modified:** src/App.tsx, TransactionForm.tsx, CurrencyInput.tsx, CoinDropdown.tsx, ExchangeDropdown.tsx, TransactionHistory.tsx, DeleteConfirmDialog.tsx, EmptyState.tsx
- **Committed in:** 2ef0192

**7. [Rule 4-adjacent — explicit product decision, not autonomous] Exchange changed from required to optional**
- **Found during:** W3-4 human walkthrough, round 2
- **Issue/Decision:** The human explicitly instructed relaxing TX-07/D-11's "every entry has an exchange" framing — exchange should not block submission
- **Fix:** Nullable `exchange_id` (schema migration via `drizzle-kit push`), relaxed backend validation, LEFT JOIN on read, optional UI with a "Nenhuma" clear option, "—" fallback in history
- **Files modified:** src/db/schema.ts, src/server/routes/transactions.ts, src/api/client.ts, src/components/{TransactionForm,ExchangeDropdown,TransactionHistory}.tsx, src/server/__tests__/{testDb,transactions.integration.test}.ts
- **Verification:** 4 new integration tests (omitted/null exchange_id accepted, unknown exchange_id still rejected, LEFT JOIN returns null-exchange rows); live end-to-end check
- **Committed in:** 2ef0192
- **Note:** This is an explicit, human-directed product decision communicated via the checkpoint feedback loop, not an autonomous Rule 1-3 deviation — documented here for traceability since it changes the plan's original TX-07 framing.

**8. [Rule 2 - UX improvement, human-UAT-requested] Live pt-BR money-mask formatting for Valor Total/Taxa/Valor recebido**
- **Found during:** W3-4 human walkthrough, round 2
- **Issue:** BRL text inputs were plain unformatted fields; the human wanted digit-by-digit progressive formatting toward `100.500,00`, consistent with CurrencyInput's currency-aware UX
- **Fix:** Added `maskMoneyInput()` (digit-extraction, cents-based mask, re-derived from the full current input on every keystroke) and wired it into CurrencyInput's BRL field and TransactionForm's Taxa/Valor recebido fields; underlying value still flows through Decimal.js exactly as before (display-only change)
- **Files modified:** src/lib/format.ts, src/lib/__tests__/format.test.ts, src/components/CurrencyInput.tsx, src/components/TransactionForm.tsx
- **Verification:** 5 new format.test.ts cases; live end-to-end check
- **Committed in:** 2ef0192

---

**Total deviations:** 8 (3 auto-fixed blocking/missing-critical during initial execution; 5 found and fixed via 2 rounds of human UAT feedback on the W3-4 checkpoint, one of which — exchange-optional — is an explicit human product decision rather than an autonomous fix)
**Impact on plan:** All fixes necessary for correctness (Bug 5: submission was silently blocked), locale/convention correctness (Bug 4), or explicit human-directed UX/product changes (Bugs 6-8). No unrequested scope creep — every deviation traces to either a build/test blocker or a specific human UAT finding.

## Issues Encountered

- **Stray dev-server processes across verification rounds:** Background `npm run dev` instances from earlier verification steps occasionally weren't fully killed by a single `pkill` pass (child processes spawned by `concurrently`/`tsx --watch` outlive a simple PID kill), causing `EADDRINUSE` on port 3000 restarts. Resolved each time with a more targeted `pkill -f <worktree-path>` + `fuser -k` sweep before restarting; final state confirmed clean (no stray processes, dev server stopped) before finishing.
- **Two of this plan's context files referenced in the plan's own `<context>` block (`01-CONTEXT.md`, `01-RESEARCH.md`) do not exist in this repository** (only `01-PLAN.md` and `01-SKELETON.md` are present; no `STATE.md`/`REQUIREMENTS.md`/`config.json` either). Proceeded using the PLAN.md's own detailed `<behavior>`/`<action>`/`<acceptance_criteria>` blocks (self-contained and sufficiently detailed) plus `.planning/research/*.md` and `PROJECT.md`/`ROADMAP.md` for context. No information gap was identified during execution as a result.

## User Setup Required

None - no external service configuration required. `COINGECKO_API_KEY` in `.env.example` is optional (documented); the app runs keyless with lower CoinGecko rate limits, and every conversion path has an always-available manual BRL override.

## Next Phase Readiness

- Phase 2 (Portfolio Dashboard + Market Prices) can plug directly into `coins.coingecko_id` (present since Wave 0) and `GET /api/positions` for market-value enrichment — no schema migration needed for that hookup.
- Phase 3 (Bens e Direitos Tax Report) can reuse `calculatePositions(txs, asOf)` with a Dec-31 cutoff date (already supported by the engine's `asOf` parameter) and the `exchanges` table (a nullable `cnpj` column can be ALTERed on without touching existing rows).
- No blockers. One known, documented limitation: editing a BUY's quantity down is not currently re-validated against later sells that may have already consumed that quantity (positions still recompute correctly on every read; no 400 is raised at edit-time for that specific edge case) — flagged in the W3-1 commit message for future hardening, out of this plan's explicit scope.

---
*Phase: 01-transaction-management-position-engine*
*Completed: 2026-07-09*
