# Walking Skeleton — Crypto Organizer

**Phase:** 1
**Generated:** 2026-07-08

## Capability Proven End-to-End

A user opens the running app (`npm run dev`) and sees the seeded list of coins fetched live from the local SQLite database through the Hono API and rendered by React — proving the full DB -> API -> UI stack works before any transaction feature is built.

> This is delivered by Wave 0 tasks W0-1 (scaffold + dev orchestration), W0-2 (schema + seed = one real DB write), and W0-3 (GET /api/coins + React query render = one real DB read surfaced in one real UI interaction). The pure position engine (W0-4/W0-5) is proven in parallel with unit tests and has no UI dependency.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | React 19 + Vite 6 + TypeScript 5 | Locked in CLAUDE.md; largest ecosystem, shadcn/ui + TanStack compatibility, sub-second HMR |
| Styling | Tailwind CSS v4 via @tailwindcss/vite (CSS-first, no config file) + shadcn/ui | Locked; v4 faster, shadcn owns-the-code components for tables/forms/dialogs |
| Backend framework | Hono 4 on Node.js 22 via @hono/node-server (port 3000) | Locked; Web-Standards, no lock-in — same code can deploy to a VPS/edge later without rewrite (keeps the "host online later" door open per PROJECT constraints) |
| Data layer | SQLite (better-sqlite3 12.3) + Drizzle ORM 0.45; amounts stored as TEXT | Locked; single-user synchronous driver is ideal locally; TEXT preserves Decimal precision (SQLite REAL would corrupt money math) |
| Money/quantity math | Decimal.js 10.6 for EVERY arithmetic step; native Number forbidden | Locked, non-negotiable — IEEE 754 floats corrupt preco medio / custo de aquisicao |
| Derived state | Never persisted — positions recomputed from the immutable ledger at read time | Makes edit/delete trivially correct; single source of truth; enables Phase 3 asOf snapshots |
| Data fetching | TanStack Query 5 (staleTime 60s; invalidate on mutation) | Locked; handles caching + live table re-render without refresh |
| External price API | CoinGecko v3 free Demo tier; used ONLY for input-time USDT->BRL conversion in Phase 1 | Historical->current->manual-override fallback; cost/IR data never depends on it |
| Deployment target | Local dev via a single `npm run dev` (Vite + Hono via concurrently); SQLite file travels with the app | PROJECT constraint: local-first now, hostable later with no migration |
| Directory layout | `src/db`, `src/engine`, `src/lib`, `src/server/routes`, `src/components`, `src/hooks`, `src/api` | Clean seams: engine is pure/framework-free; server owns I/O; components are read-only renderers |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + React + TS, Hono server, Tailwind v4, Vitest, concurrently dev script) — W0-1
- [x] Routing — real API routes (`/api/health`, `/api/coins`, `/api/exchanges`) — W0-1, W0-3
- [x] Database — real write (seed) AND real read (GET /api/coins) — W0-2, W0-3
- [x] UI — interactive element wired to the API (React Query renders seeded coins with loading/error) — W0-3
- [x] Deployment — documented local full-stack run command (`npm run dev`) — W0-1

## Out of Scope (Deferred to Later Slices / Phases)

- Market-price enrichment / live BRL+USD quotes / unrealized P&L / BRL-USD toggle — Phase 2 (PRC-*, POS-04). Phase 1 uses CoinGecko ONLY for input-time USDT->BRL conversion.
- Portfolio summary dashboard (totals aggregated across coins) — Phase 2.
- Bens e Direitos / IR report, R$5.000 threshold, Discriminacao text — Phase 3 (IR-*).
- Exchange CNPJ cadastro — Phase 3 (the exchanges table is designed so a nullable `cnpj` column ALTERs on without a destructive migration).
- Capital-gains math on a sell's "valor recebido" — stored inert now, consumed by a future v2 milestone.
- CSV import, multi-user/auth/hosted deploy, PWA/mobile — v2 (the `origin` column exists from day one so CSV imports only add rows).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 1 (this phase), remaining slices:** buy entry (Wave 1) -> sell + currency conversion (Wave 2) -> edit/delete + coin/exchange CRUD + verification (Wave 3).
- **Phase 2:** add a `price_cache` (coin_id, price_brl, price_usd, fetched_at), a CoinGecko batch fetch (`vs_currencies=brl,usd`), market-value/P&L columns with a BRL/USD toggle, and a portfolio summary — plugging into the existing `coins.coingecko_id` and `/api/positions`.
- **Phase 3:** add a nullable `cnpj` to `exchanges`, run `calculatePositions(txs, asOf=Dec 31)` for the Bens e Direitos report, the R$5.000 threshold filter, and copyable Discriminacao text.
