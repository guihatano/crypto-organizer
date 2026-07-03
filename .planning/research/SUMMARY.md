# Project Research Summary

**Project:** Crypto Organizer
**Domain:** Personal crypto portfolio tracker — local-first web app, Brazilian IR (Bens e Direitos) reporting
**Researched:** 2026-07-03
**Confidence:** MEDIUM

## Executive Summary

Crypto Organizer is a single-user, local-first web application whose primary purpose is not general portfolio tracking but specifically correct Brazilian income tax reporting (Bens e Direitos). The distinction matters architecturally: no mainstream tool (Koinly, CoinTracker, CoinStats) implements native Brazilian custo de aquisição tracking with the Dec 31 snapshot required by Receita Federal. That gap is the reason to build a custom tool. The recommended approach is a Node.js + Hono backend serving a React/Vite SPA, with SQLite via Drizzle ORM, started with a single `npm run dev` and zero infrastructure.

The most critical technical decision is to treat the transaction ledger as append-only and derive all position data (preço médio, custo de aquisição) by replaying the ledger at read time using Decimal.js arithmetic — never native JS floats, never stored derived state. The Brazilian tax rule that differentiates this app from US-style trackers is that selling does NOT change the preço médio; only buys recalculate the weighted average. Getting this wrong invalidates every Bens e Direitos figure the app produces.

The two highest risks are financial calculation correctness (float math, wrong sell logic, excluded fees) and data independence (the IR report must never depend on price API availability). Both are avoidable by architectural discipline: Decimal.js from day one, strict separation of the core position engine from the optional price-enrichment layer, and unit tests for the buy/sell algorithm before building any UI.

---

## Key Findings

### Recommended Stack

A single Node.js 22 LTS process runs the Hono 4 REST API and, in production, serves the compiled React 19 / Vite 6 SPA. SQLite via better-sqlite3 travels with the process — no database server, no migrations to a cloud provider. The stack is deliberately chosen to be runnable with `npm run dev` and deployable later to a VPS or Cloudflare Workers without code changes (Hono's Web Standards API makes this possible). CoinGecko's free Demo tier (30 req/min) covers BRL price data. The non-negotiable choice is Decimal.js for all monetary and quantity arithmetic; native JS floats will silently corrupt preço médio calculations.

**Core technologies:**
- **Node.js 22 LTS** — runtime; 22 specifically for better-sqlite3 compatibility and native fetch
- **TypeScript 5.x** — type safety across the stack; critical for financial logic
- **React 19 + Vite 6** — SPA with sub-second HMR; shadcn/ui component compatibility
- **Hono 4 + @hono/node-server** — TypeScript-native API; 4x faster than Express; no vendor lock-in
- **better-sqlite3 12.x** — synchronous, fastest Node.js SQLite driver; ideal for single-user local app
- **Drizzle ORM 0.45** — type-safe schema + migrations; schema is portable to PostgreSQL if hosted later
- **Decimal.js 10.6** — arbitrary-precision decimal math; the only correct choice for BRL + fractional crypto
- **TanStack Query v5** — API caching and background refetch with configurable refetchInterval
- **CoinGecko Demo API** — free BRL price feed; 30 calls/min; store prices with fetched_at for offline use

### Expected Features

The minimum viable product must replace a manual spreadsheet for Bens e Direitos filing. All core features are achievable with LOW-to-MEDIUM implementation complexity.

**Must have (table stakes) — v1:**
- Buy transaction entry (date, coin, qty, total BRL paid including fees, exchange)
- Sell transaction entry with proportional custo de aquisição reduction; preço médio unchanged
- Transaction history list with edit and delete (triggers full recalculation)
- Per-coin position view: quantity, preço médio, custo de aquisição
- Correct preço médio per Brazilian rules (weighted average; fees included; unchanged on sell)
- Bens e Direitos report: custo de aquisição per coin as of Dec 31 of selected year; R$5k threshold filter
- Exchange / source tag per transaction (required for Discriminação field in IRPF)
- Current price via CoinGecko (on demand; graceful degradation; must not block IR report)
- Market value and unrealized P&L per coin (derived from price + position)

**Should have (differentiators) — v1.x:**
- Year-selectable Dec 31 snapshot (replay positions as of any Dec 31)
- R$5k threshold indicator per coin on holdings screen
- Discriminação auto-generator (one-click copy for IRPF software)
- Portfolio summary dashboard (total invested vs total market value)

**Defer (v2+):**
- CSV import from exchanges (each format differs; manual entry first)
- Capital gains / DARF calculation (different problem; own milestone)
- Multi-user / authentication / hosted deployment (major architecture change)

### Architecture Approach

The architecture separates two independent subsystems: (1) the core ledger + position engine, which is pure, deterministic, offline-capable, and the only source of IR truth; and (2) the price-enrichment layer, which is async, best-effort, and never allowed to block the core. All transactions are stored append-only (event sourcing lite). Derived state — preço médio, custo de aquisição — is computed at read time by replaying the ledger. The Report Generator is identical to the Position Engine with a date cutoff (asOf="YYYY-12-31"), making multi-year support nearly free.

**Major components:**

1. **Ledger Store** — append-only SQLite transactions table; quantities and BRL amounts stored as TEXT strings, never REAL
2. **Position Engine** — pure TypeScript function; replays ledger chronologically; uses Decimal.js; no I/O; fully unit-testable in isolation
3. **Report Generator** — calls Position Engine with asOf date; applies R$5k filter; maps coins to Grupo 08 IR codes; no price dependency
4. **Price Cache + Fetcher** — async background CoinGecko calls; SQLite price_cache table; serves stale on error; never blocks core data path
5. **Hono Routes** — thin HTTP layer; delegates to engine and db layers; no business logic
6. **React UI** — Transaction form, Portfolio dashboard, IR Report view; no business logic; shadcn/ui components

### Critical Pitfalls

1. **Float arithmetic for BRL amounts** — Use Decimal.js for all monetary math; store amounts as TEXT in SQLite, never as REAL. Native JS number produces 0.30000000000000004 and will corrupt every preço médio figure. Verify with unit test: 3 purchases of R$333,33 must total exactly R$999,99.

2. **Recalculating preço médio after a sell** — This is the Brazil-specific rule: selling does NOT change the unit average cost. Only quantity and total custo de aquisição drop proportionally. After a partial sell, preco_medio must be numerically identical to its pre-sell value — verify with Decimal equality assertion, not float equality.

3. **Declaring market value instead of custo de aquisição in Bens e Direitos** — The IR report must read exclusively from the ledger cost basis. Physically separate these two data flows in code. Integration test: change mock price, assert report output unchanged.

4. **Misapplying the R$5,000 threshold (per asset, not per portfolio)** — Each coin is evaluated independently. R$6k BTC + R$2k ETH means declare only BTC. Filter per position, not on aggregate. Test boundary: exactly R$5,000 is included; R$4,999.99 is excluded.

5. **Excluding fees from cost basis** — Exchange fees must be included in custo de aquisição. Unit test: buy 1 BTC for R$100,000 with R$500 fee, custo total must be R$100,500.

---

## Implications for Roadmap

Based on combined research, the architecture's own suggested build order maps naturally to 4 phases.

### Phase 1: Data Foundation — Ledger and Position Engine

**Rationale:** All other features depend on correct data storage and correct financial math. This is the correctness foundation. Build and extensively test it before any UI. The pitfall-to-phase mapping assigns 5 of 11 pitfalls to this phase.
**Delivers:** SQLite schema (append-only transactions table, TEXT amounts), Drizzle migrations, Position Engine pure function (preço médio, custo de aquisição), full unit test suite for buy/sell/partial-sell/fees scenarios.
**Addresses:** Buy entry, sell entry, preço médio calculation, exchange tagging, per-coin position data.
**Avoids:** Float arithmetic pitfall, wrong sell logic pitfall, fees-excluded pitfall, mutable ledger pitfall, SQLite without WAL pitfall.
**Research flag:** Standard patterns — no additional research phase needed. Vitest unit tests are mandatory before proceeding to Phase 2.

### Phase 2: Core UI — Transaction Entry and Portfolio Dashboard

**Rationale:** Once the engine has passing tests, wire it to a minimal UI so the user can enter real data and validate the calculations before building the IR report.
**Delivers:** Hono REST routes (transactions CRUD, positions endpoint), React transaction form (buy/sell), portfolio holdings table (qty, preço médio, custo de aquisição). No price data yet.
**Addresses:** Transaction history list, edit/delete, per-coin position view.
**Avoids:** Business logic leaking into UI components; all computation stays in engine layer.
**Research flag:** Standard patterns — React/Hono/TanStack Query integration is well-documented.

### Phase 3: Price Enrichment — CoinGecko Integration

**Rationale:** Isolated risk. If CoinGecko integration proves unreliable or rate-limit constraints require adjustment, Phases 1 and 2 remain fully functional. This phase is additive only.
**Delivers:** CoinGecko API client (batched requests using coin-ID not symbol), SQLite price_cache with TTL, background refresh via TanStack Query refetchInterval, portfolio enriched with market value and unrealized P&L, graceful "preco indisponivel" UI state.
**Addresses:** Current price fetch, market value per coin, unrealized P&L, graceful degradation.
**Avoids:** N+1 API calls pitfall (batch all coins in one request), null-price-as-zero pitfall, UI blocked on price fetch failure.
**Research flag:** CoinGecko coin-ID mapping (symbol vs id) needs a smoke test against the live API before shipping.

### Phase 4: Bens e Direitos Report

**Rationale:** The primary deliverable of the product. Built last because it depends on a proven Position Engine (Phase 1) and real user transactions (Phase 2). Price data must not be involved here.
**Delivers:** Report Generator (Position Engine with asOf date cutoff), year selector UI, per-coin Grupo 08 IR code mapping (01=BTC, 02=ETH, 03=Altcoin, 10=Stablecoin), R$5k threshold filter and visual indicator, Discriminação text generator for copy-paste into IRPF.
**Addresses:** Bens e Direitos report, R$5k threshold indicator, year-selectable snapshot, Discriminação auto-generator.
**Avoids:** Market value in IR report pitfall, per-portfolio threshold pitfall, timezone Dec 31 snapshot pitfall, missing Grupo 08 sub-codes pitfall.
**Research flag:** Timezone handling needs explicit unit test: a transaction at 23:50 BRT Dec 31 (= 02:50 UTC Jan 1) must appear in the Dec 31 snapshot, not Jan 1.

### Phase Ordering Rationale

- The Position Engine must have passing tests before any UI is built. Wiring UI to a buggy engine embeds the bug in a context where it is harder to isolate.
- Price enrichment is Phase 3, not Phase 2, because IR reporting must be demonstrably price-independent before the price layer exists. If both are built simultaneously, the separation discipline tends to erode.
- The Bens e Direitos report is Phase 4 rather than bundled with the position view because it needs real user data to validate, and the R$5k threshold and timezone edge cases require a mature engine.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Bens e Direitos):** Grupo 08 sub-code assignments for less common tokens may need verification against the current year's IRPF normativa. Codes can change annually.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Drizzle + better-sqlite3 + Decimal.js patterns are thoroughly documented and stable.
- **Phase 2 (Core UI):** React + Hono + TanStack Query patterns are well-established.
- **Phase 3 (Price Enrichment):** CoinGecko integration is straightforward; main validation is a live API smoke test.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | All packages stable and widely adopted; version compatibility cross-checked against npm and official docs |
| Features | MEDIUM | Brazilian tax rules cross-checked across 5+ Brazilian sources; competitor landscape from public docs |
| Architecture | MEDIUM | Core patterns (event sourcing, recompute-on-read, price isolation) well-established for financial apps; IR encoding confirmed via multiple sources |
| Pitfalls | MEDIUM | Five critical pitfalls specific to Brazilian tax domain are well-sourced; float and SQLite pitfalls are universal |

**Overall confidence:** MEDIUM

### Gaps to Address

- **CoinGecko coin ID mapping for altcoins:** Research confirms BTC/ETH map to `bitcoin`/`ethereum`, but the strategy for arbitrary altcoins (hardcoded top-N list vs /coins/list endpoint integration) is unresolved. Decide in Phase 3 planning.
- **Grupo 08 IR sub-code assignments:** Confirm current year's IRPF normativa before Phase 4, as codes change annually.
- **Timezone for Dec 31 snapshot:** Decide explicitly whether Dec 31 cutoff uses BRT (UTC-3) or UTC, and add a unit test. Transactions at 23:50 BRT on Dec 31 are in scope for that year.
- **Fee capture UX:** An explicit taxa field on the buy form is recommended over instructing users to include fees in the total. Decide in Phase 2 planning.

---

## Sources

### Primary (authoritative)
- Instrução Normativa RFB 1.888/2019 — foundational crypto reporting obligations in Brazil
- Receita Federal: declaração de operações com criptoativos — official guidance

### Secondary (MEDIUM confidence — multiple sources agree)
- [Blocktrends: Como declarar criptomoedas IR 2026](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-renda-2026/) — preço médio rule, Grupo 08 codes, R$5k threshold
- [Nubank: Como declarar criptomoedas no IR](https://blog.nubank.com.br/como-declarar-criptomoedas-imposto-de-renda/) — custo de aquisição rule
- [CoinTracker: Brazil crypto tax guide](https://www.cointracker.io/blog/brazil-crypto-tax-guide) — Bens e Direitos declaration rules
- [KoinX: How to declare crypto in Brazil](https://www.koinx.com/tax-guides/declare-crypto-tax-return-brazil) — threshold and snapshot rules
- [declarandobitcoin.com.br: Venda, permuta e transferencia](https://www.declarandobitcoin.com.br/post/venda-permuta-e-transfer%C3%AAncia-quais-opera%C3%A7%C3%B5es-geram-imposto-em-criptomoedas) — sell does not change preço médio

### Tertiary (LOW confidence — needs validation at implementation)
- npm package pages for better-sqlite3, decimal.js, drizzle-orm, @tanstack/react-query, tailwindcss, hono
- CoinGecko API pricing and rate limit docs
- shadcn/ui Tailwind v4 docs
- Drizzle ORM SQLite docs

---

*Research completed: 2026-07-03*
*Ready for roadmap: yes*
