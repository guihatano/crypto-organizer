# Stack Research

**Domain:** Personal crypto portfolio tracker — local-first web app, financial math, BRL, Brazilian IR (Bens e Direitos)
**Researched:** 2026-07-03
**Confidence:** MEDIUM (websearch cross-checked against official npm/docs pages; core packages are stable and widely adopted)

---

## Recommended Stack

### Architecture Overview

Run a single Node.js process locally that serves both the REST API (Hono) and, in production, the compiled React static files. In development, Vite and Hono run on separate ports and `concurrently` starts both with one command. This pattern:

- Starts with `npm run dev` — zero infrastructure required.
- Ships as a Docker container or a plain Node.js process on any VPS if you ever want to host.
- Never requires a database migration to a cloud provider (SQLite file travels with the server).

```
Local dev:
  Vite (port 5173) ←→ React SPA ←→ fetch to Hono (port 3000)
  Hono (port 3000) ←→ better-sqlite3 ←→ data.db

Production build:
  Hono (port 3000) ←→ serves /dist (React build) + /api routes
                   ←→ better-sqlite3 ←→ data.db
```

---

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | JavaScript runtime | LTS until 2027; supported by all packages in this stack (better-sqlite3 explicitly supports 20, 22, 23, 24). Use 22, not 20, to get the native `--experimental-sqlite` flag if needed later. |
| TypeScript | 5.x | Type safety across the stack | Avoids entire classes of bugs in financial logic; both Hono and Drizzle are built TypeScript-first. |
| React | 19.x | Frontend UI framework | 44.7% developer adoption, largest ecosystem, shadcn/ui compatibility, long-term maintainability for a personal app that may be shared or extended. |
| Vite | 6.x | Frontend build tool + dev server | Sub-second HMR, zero-config React TypeScript template (`npm create vite@latest -- --template react-ts`), production builds with tree-shaking. |
| Hono | 4.x | Backend HTTP framework | TypeScript-native, 4.1× faster than Express, built on Web Standards (fetch/Request/Response). Runs on Node.js now via `@hono/node-server`; deploys to Cloudflare Workers, Vercel, and others without code changes — the "no lock-in" future-hosting choice. |
| better-sqlite3 | 12.3.x | SQLite driver | The fastest Node.js SQLite driver. Synchronous API is actually ideal for a single-user local app (simpler code, no callback hell). Supports Node 20, 22, 23, 24. |
| Drizzle ORM | 0.45.x | Type-safe database layer | Schema-as-TypeScript, type-safe queries, migration support via `drizzle-kit`. Works with better-sqlite3 out of the box. |
| Decimal.js | 10.6.x | Arbitrary-precision decimal math | **The critical financial correctness choice.** Native JS floats will corrupt preço médio calculations (`0.1 + 0.2 !== 0.3`). Decimal.js handles both BRL monetary values and fractional crypto quantities (e.g. 0.00314159 BTC). Used by 3,849+ npm packages including Prisma. |
| CoinGecko API | v3 (free Demo tier) | Live crypto prices in BRL | Free Demo tier (free registration): 30 calls/min, BRL confirmed supported (`vs_currencies=brl`), prices updated every 60s. Endpoint: `/simple/price`. No cost for a personal app. |

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | 5.101.x | Data fetching, caching, background refetch | Use for all API calls — CoinGecko prices (with `refetchInterval: 60_000`) and local Hono backend calls. Handles loading/error states, automatic retry, stale-while-revalidate. |
| `tailwindcss` | 4.3.x | Utility-first CSS styling | v4 is CSS-first (no `tailwind.config.js`); 5× faster builds than v3. Use `@tailwindcss/vite` plugin. |
| `shadcn/ui` | latest CLI | React component library | Copy-paste components (you own the code) built on Radix UI + Tailwind v4. Updated for React 19 + Tailwind v4. Install individual components as needed; good default for tables, forms, and dialogs. |
| `concurrently` | 9.x | Run Vite + Hono in parallel | `"dev": "concurrently \"vite\" \"node --watch src/server/index.ts\""` — one command to start everything locally. |
| `tsx` | 4.x | TypeScript execution for the server | Runs TypeScript Node.js files directly without a compile step in development. Use with `--watch` for hot reload of the server. |
| `drizzle-kit` | 0.30.x | Database migrations | Generates and runs SQLite migrations from your Drizzle schema. Run `npx drizzle-kit push` locally to apply schema changes. |
| `@hono/node-server` | 1.x | Hono adapter for Node.js | Required to run Hono on Node.js; the Hono core package alone targets edge runtimes. |
| `vitest` | 3.x | Unit testing | Zero-config, Vite-native test runner. Essential for validating preço médio calculation logic. |

---

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@types/better-sqlite3` | Type definitions for better-sqlite3 | Dev dependency; required for TypeScript to understand the driver API. |
| `@tanstack/react-query-devtools` | Inspect query cache in browser | Dev-only; add to devDependencies; helps debug API polling behavior. |
| ESLint + `@eslint/js` | Linting | Vite's `react-ts` template includes ESLint; configure `no-floating-decimal` and strict null checks. |

---

## Installation

```bash
# Scaffold the project (creates Vite + React + TypeScript)
npm create vite@latest . -- --template react-ts
npm install

# Backend and database
npm install hono @hono/node-server
npm install better-sqlite3 drizzle-orm
npm install -D @types/better-sqlite3 drizzle-kit tsx

# Financial math — non-negotiable for correctness
npm install decimal.js

# Data fetching and UI
npm install @tanstack/react-query
npm install tailwindcss @tailwindcss/vite
# shadcn/ui: installed per-component via CLI
npx shadcn@latest init

# Dev utilities
npm install -D concurrently vitest @tanstack/react-query-devtools
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| React 19 | Svelte 5 | If you want a smaller bundle and don't plan to use the React ecosystem (shadcn/ui, TanStack) |
| React 19 | Vue 3 | If React syntax feels unfamiliar; Vue's Composition API is gentler for beginners |
| Hono 4 + Node.js | Next.js 15 | If you want full-stack in one framework and are already on the Next.js ecosystem; heavier for a personal local app |
| Hono 4 + Node.js | Express 5 | If the team already knows Express and edge deployment is not a consideration |
| Drizzle ORM | Prisma | Prisma has better DX for complex schemas but uses its own query engine binary that complicates Electron/desktop packaging |
| Drizzle ORM | Raw SQL | Acceptable if the schema is simple; lose type safety on query results |
| better-sqlite3 | Node.js `node:sqlite` (experimental) | Node.js 22.5+ has built-in SQLite, but it is still experimental; better-sqlite3 is production-stable |
| Decimal.js | Dinero.js | Dinero.js is purpose-built for monetary amounts but represents values in cents as integers — it does NOT handle fractional crypto quantities (0.00314159 BTC) without custom conversion |
| CoinGecko Free | CoinMarketCap | CoinMarketCap free tier is more restrictive (333 calls/day); CoinGecko Demo gives 30 calls/min |
| CoinGecko Free | Binance REST API | Binance has no official BRL ticker for most pairs; would require USD→BRL conversion |
| TanStack Query v5 | SWR | Both work; TanStack Query v5 has more control over refetch intervals, which matters for polling crypto prices |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Native JS `Number` for BRL/crypto math | IEEE 754 floats will produce wrong preço médio results; `0.1 + 0.2 = 0.30000000000000004` corrupts financial data | `Decimal.js` for all monetary and quantity arithmetic |
| `localStorage` / `sessionStorage` for transactions | No relational queries, no integrity, limited to ~5 MB, lost on browser clear; financial data requires durability | SQLite via better-sqlite3 |
| Electron for "local-first" | Adds 150 MB binary overhead, complex packaging, and native module rebuilding. A local Node.js server is simpler to install and run. | Hono + Node.js server with `npm start` |
| `axios` | axios is unnecessary when `fetch` is native in Node.js 22 and browsers; adds a dependency without meaningful benefit | Native `fetch` (with TanStack Query wrapping it) |
| Tailwind CSS v3 | v3 is in maintenance mode; v4 is significantly faster and has cleaner CSS-variable theming; starting a new project on v3 incurs a later migration | Tailwind CSS v4 |
| CoinGecko without a Demo key | Public keyless tier has 5–15 calls/min (inconsistent). A free Demo account registration gives a stable 30 calls/min. | Register a free CoinGecko Demo account and use the API key |
| `moment.js` | Deprecated; massive bundle; tree-shaking does not work | Use native `Intl.DateTimeFormat` or `date-fns` v4 (tree-shakable) for any date formatting |

---

## Stack Patterns by Variant

**If you want to run offline (no CoinGecko access):**
- The core portfolio math (preço médio, custo de aquisição, Bens e Direitos report) must work without an API call.
- Store the last-fetched price per coin in SQLite; show it with a "last updated at" timestamp.
- TanStack Query's `staleTime` and `gcTime` options already support this graceful degradation pattern.

**If you later want to host this online:**
1. Build the React app: `npm run build` → `dist/`
2. Configure Hono to serve `dist/` as static files: `app.use('/*', serveStatic({ root: './dist' }))`
3. Add a login layer (Hono has `hono/bearer-auth` or `hono/jwt` middleware built in)
4. Replace the SQLite file path with a hosted SQLite (Turso/libsql) — Drizzle supports libsql with minimal changes
5. Deploy to a VPS with Node.js, or to Cloudflare Workers (switch `@hono/node-server` to the Cloudflare adapter)

**If the schema needs to support future import (CSV/exchange API):**
- The SQLite schema should have an `origin` column on every transaction (`manual`, `binance-csv`, etc.) from day one.
- Adding import logic later only adds new rows; no schema migration needed.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `better-sqlite3@12.3` | Node.js 20, 22, 23, 24 | Node 25 not officially supported yet as of July 2026 |
| `tailwindcss@4` | `@tailwindcss/vite` (not PostCSS config) | v4 with Vite uses the Vite plugin, not the PostCSS plugin used in v3 |
| `shadcn/ui` | React 19 + Tailwind v4 | Updated for both as of 2025; use `npx shadcn@latest init` which detects v4 |
| `drizzle-orm@0.45` | `better-sqlite3@12`, `drizzle-kit@0.30` | Kit version should match ORM major; check drizzle docs at migration time |
| `@tanstack/react-query@5` | React 18+ | v5 requires React 18 minimum; React 19 is fully supported |
| `hono@4` + `@hono/node-server@1` | Node.js 20+ | The node-server adapter requires Node 20; use Node 22 LTS |

---

## Decimal Math — Critical Detail

All preço médio (weighted average cost) calculations must use `Decimal.js`. The formulas are:

```typescript
import { Decimal } from 'decimal.js'

// On buy: new average cost
// precMedio = (precMedioAnterior * qtdAnterior + valorPago) / (qtdAnterior + qtdComprada)
const newAvgCost = previousAvgCost
  .mul(previousQty)
  .plus(totalPaidBRL)
  .div(previousQty.plus(boughtQty))

// On sell: average cost does NOT change (Brazilian tax rule)
// Only quantity and total acquisition cost decrease proportionally
const newQty = previousQty.minus(soldQty)
const newAcquisitionCost = newAvgCost.mul(newQty)  // precMedio × qtdRestante
```

Store values in the database as `TEXT` (string representation) — never as `REAL` — to avoid SQLite's native float representation corrupting the precision. Convert to `Decimal` on read, to string on write.

---

## CoinGecko API — Practical Setup

```
Base URL (Demo key): https://api.coingecko.com/api/v3
Headers: { x-cg-demo-api-key: YOUR_FREE_KEY }

Endpoint for current BRL prices:
GET /simple/price?ids=bitcoin,ethereum,solana,tether&vs_currencies=brl&include_24hr_change=true

Response example:
{
  "bitcoin": { "brl": 540000.00, "brl_24h_change": 1.23 },
  "ethereum": { "brl": 18500.00, "brl_24h_change": -0.45 }
}

Rate limit:   30 calls/min (Demo free tier)
Cache/update: 60 seconds
BRL support:  confirmed
```

Use TanStack Query's `refetchInterval: 60_000` to stay within the rate limit and keep prices current. Store the API key in a `.env` file (`VITE_COINGECKO_KEY=...` exposes it in the frontend; for a local app this is acceptable; for a hosted app, proxy through Hono to keep the key server-side).

---

## Sources

- [CoinGecko API pricing plans](https://www.coingecko.com/en/api/pricing) — rate limits and tier details (websearch, LOW confidence)
- [CoinGecko /simple/price reference](https://docs.coingecko.com/reference/simple-price) — BRL confirmed, parameters (webfetch, LOW confidence)
- [CoinGecko supported currencies](https://docs.coingecko.com/reference/simple-supported-currencies) — BRL listed explicitly (webfetch, LOW confidence)
- [npm: better-sqlite3](https://www.npmjs.com/package/better-sqlite3) — v12.3.0, Node 20/22 support (websearch, LOW confidence)
- [npm: decimal.js](https://www.npmjs.com/package/decimal.js) — v10.6.0 (websearch, LOW confidence)
- [npm: drizzle-orm](https://www.npmjs.com/package/drizzle-orm) — v0.45.2 (websearch, LOW confidence)
- [npm: @tanstack/react-query](https://www.npmjs.com/package/@tanstack/react-query) — v5.101.2 (websearch, LOW confidence)
- [npm: tailwindcss](https://www.npmjs.com/package/tailwindcss) — v4.3.1 (websearch, LOW confidence)
- [Tailwind CSS v4 release notes](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, @tailwindcss/vite (websearch, LOW confidence)
- [Hono Node.js docs](https://hono.dev/docs/getting-started/nodejs) — @hono/node-server setup (websearch, LOW confidence)
- [Drizzle ORM SQLite docs](https://orm.drizzle.team/docs/sqlite/get-started-sqlite) — better-sqlite3 integration (websearch, LOW confidence)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — React 19 + v4 support confirmed (websearch, LOW confidence)

---

*Stack research for: Crypto Organizer — personal crypto portfolio tracker, BRL, Brazilian IR*
*Researched: 2026-07-03*
