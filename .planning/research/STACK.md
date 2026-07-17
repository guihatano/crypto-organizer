# Stack Research

**Domain:** Personal crypto portfolio tracker — local-first web app, financial math, BRL, Brazilian IR (Bens e Direitos)
**Researched:** 2026-07-03 (v1.0 baseline) · updated 2026-07-17 (v1.1 additions: dark mode, auth, CSV backup)
**Confidence:** MEDIUM (v1.0 baseline: websearch cross-checked against official npm/docs pages) · LOW-MEDIUM (v1.1 additions: websearch/webfetch sourced per this project's convention; versions verified directly against the npm registry)

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
| `shadcn/ui` | latest CLI | React component library | Copy-paste components (you own the code) built on Radix UI + Tailwind v4. Updated for React 19 + Tailwind v4. Install individual components as needed; good default for tables, forms, and dialogs. **Not yet installed as of v1.1** — no `@radix-ui/*` deps or `src/components/ui/` exist in the codebase yet; still the recommended choice whenever richer components (tables, dialogs, dropdowns) are actually needed. |
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
3. Add a login layer — as of v1.1 this is being built now (see "v1.1 Additions" below): custom Argon2id + signed-session-cookie auth, not `hono/bearer-auth`/`hono/jwt`, chosen specifically for the single-user, revocable-session, financial-data requirements.
4. Replace the SQLite file path with a hosted SQLite (Turso/libsql) — Drizzle supports libsql with minimal changes
5. Deploy to a VPS with Node.js, or to Cloudflare Workers (switch `@hono/node-server` to the Cloudflare adapter)

**If the schema needs to support future import (CSV/exchange API):**
- The SQLite schema should have an `origin` column on every transaction (`manual`, `binance-csv`, etc.) from day one.
- Adding import logic later only adds new rows; no schema migration needed.
- As of v1.1, "import" specifically means round-tripping the app's **own** CSV export format (backup/restore), not third-party exchange CSV formats — that stays explicitly out of scope.

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

**v1.1 note:** the same string-round-trip discipline applies to CSV export/import — see "CSV Backup" below. `Decimal` fields must be serialized with `.toString()` (never `.toNumber()`) when writing CSV, and re-parsed with `new Decimal(field)` (never `Number(field)`) when reading CSV back in.

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

## v1.1 Additions (2026-07-17): Dark Mode, Single-User Auth, CSV Backup

These are the **only new stack decisions** for the v1.1 milestone. Everything above (v1.0 baseline) is unchanged. This section is intentionally scoped to what's new — see `CLAUDE.md` for the full v1.0 stack rationale.

### New Core Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Tailwind v4 `@custom-variant dark` | n/a (CSS directive, no package) | Class-based dark mode | Tailwind v4 dropped `tailwind.config.js` dark mode config. The class strategy is now declared directly in the CSS entrypoint: `@custom-variant dark (&:where(.dark, .dark *));` placed right after `@import "tailwindcss";` in `src/index.css`. Toggling the `.dark` class on `<html>` (or a wrapper) then drives every `dark:` utility. Confirmed against the official Tailwind docs (tailwindcss.com/docs/dark-mode). |
| `argon2` (node-argon2) | 0.44.0 | Password hashing for the single-user login | OWASP/NIST 2026 guidance recommends Argon2id as the default for new systems — it's memory-hard, which matters more than raw CPU cost against GPU/ASIC cracking. It's a native addon (like `better-sqlite3`, which this project already compiles), so it doesn't introduce a new category of build risk. npm registry: OK verdict, 1.6M weekly downloads, actively maintained (`ranisalt/node-argon2`). **Security-relevant choice** — this protects the one credential guarding all financial data. |
| Hono built-in `hono/cookie` (`setSignedCookie`/`getSignedCookie`) | Included in `hono@4.12.28` (already installed) | Session cookie issuance + tamper-proof verification | No new dependency. Hono's cookie helper signs with HMAC-SHA256 via WebCrypto and supports `httpOnly`, `secure`, `sameSite`, `maxAge`, `path`, and the `__Host-`/`__Secure-` prefixes — everything needed for a session cookie that is safe to move from local HTTP to hosted HTTPS later without an API change (only flip `secure: true` behind an env check). `getSignedCookie` returns `false` on a tampered signature, so verification is a one-liner. **Security-relevant choice.** |
| `csv-parse` + `csv-stringify` | `csv-parse@7.0.1`, `csv-stringify@6.8.1` | CSV export (write) and import (parse) of the app's own backup format | Both are part of the long-established Adaltas `node-csv` monorepo (10+ years, MIT). `csv-stringify` handles RFC 4180 quoting/escaping correctly (commas, quotes, newlines inside a memo/notes-style field) so hand-rolled `join(',')` string building — which silently corrupts data with embedded commas — is never needed. `csv-parse` handles the read side symmetrically, including BOM and quoted-field edge cases. Both ship synchronous entry points (`csv-parse/sync`, `csv-stringify/sync`) that pair naturally with the project's existing synchronous `better-sqlite3` style — no callbacks/streams needed for a single-user dataset of at most a few thousand rows. |

### New Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `node:crypto` (`randomUUID`, `randomBytes`, `timingSafeEqual`) | Node 22 built-in | Session token generation, comparing hashed values | No package needed. Use `randomUUID()` (or `randomBytes(32).toString('hex')`) as the opaque session ID stored server-side; never put anything but that opaque ID in the cookie payload. |
| `zod` (optional) | 4.4.3 | Schema validation of CSV rows on import | The codebase currently hand-validates request bodies (see `src/server/routes/*.ts`, e.g. the recent "reject non-object PATCH bodies" fix) — no schema library is in use today. CSV import is exactly the kind of "external, untrusted, many-fields" input where a schema (row shape, required fields, date/decimal format) pays for itself and centralizes error messages for bad rows. Treat as optional: only add it if the hand-rolled validator for CSV rows starts duplicating logic across export/import; otherwise stay consistent with the existing manual-validation convention. |
| `hono-sessions` (alternative, not primary) | 0.8.1 | Full session middleware w/ pluggable stores (cookie, DB, etc.) | Only reach for this if session requirements grow beyond "one opaque token + one row in a `sessions` table" — e.g. sliding expiration, key rotation, multiple concurrent devices. For a single-user app it's more machinery than needed today; the built-in `hono/cookie` + a `sessions` table via Drizzle covers the stated requirement with zero new dependencies. |

No new dev-only tooling is required for v1.1 — dark mode, auth, and CSV all build on tooling already in the project (`vitest`, `drizzle-kit`, `tsx`).

### v1.1 Installation

```bash
# Core additions
npm install argon2 csv-parse csv-stringify

# Optional (only if CSV row validation grows complex)
npm install zod
```

Dark mode requires no `npm install` — it's a CSS directive change in `src/index.css` plus a small React theme-toggle context. Session handling requires no `npm install` either — `hono/cookie` ships inside the already-installed `hono` package; only the `argon2` password hasher and a new `sessions` table (via `drizzle-kit push`) are new.

### Design Notes for Each New Feature

**Dark Mode**
- Add `@custom-variant dark (&:where(.dark, .dark *));` to `src/index.css` right after `@import "tailwindcss";`.
- Toggle a `.dark` class on `<html>`, driven by a small `ThemeContext`/`useTheme` hook (no `next-themes` — that library assumes Next.js's SSR hydration model, which doesn't apply to this Vite SPA).
- Persist the choice the same way the existing BRL/USD toggle is persisted — `localStorage` (already the established pattern per `PROJECT.md` Key Decisions; "manual persistence" in the milestone scope means no OS `prefers-color-scheme` auto-detection, just an explicit toggle remembered across reloads).
- shadcn/ui is listed in the validated stack but **not yet installed** in this codebase (no `@radix-ui/*` deps, no `src/components/ui/`) — dark mode does not require installing it. If/when shadcn components are added later, the same `.dark` class + CSS variable architecture shadcn expects will already be in place.

**Auth (single user, session-based)**
- **Setup flow:** on first run, if no user row exists, show a "create your password" screen instead of a login screen (no public signup route ever exists after that first row is created — the route itself can check `SELECT COUNT(*) FROM users` and refuse to render/accept once a user exists).
- **Password storage:** `argon2.hash(password)` (Argon2id, defaults are reasonable; tune `memoryCost`/`timeCost` only if login feels slow on the target hardware) → store the encoded hash string in a `users` table (single row expected).
- **Session:** on successful login, generate an opaque token (`randomUUID()`), store it (or its hash) in a `sessions` table with `expires_at`, and set it as a **signed** cookie via `setSignedCookie(c, 'session', token, secret, { httpOnly: true, sameSite: 'Lax', secure: <true when hosted over HTTPS>, path: '/', maxAge: <chosen session length> })`. A Hono middleware on protected routes calls `getSignedCookie` (rejects tampered cookies automatically), looks up the token server-side, and checks `expires_at`.
- **Why session-in-DB instead of a stateless JWT/self-contained cookie:** a DB-backed session can be revoked immediately (logout, or "log out everywhere" later) — a stateless signed JWT cannot without an extra revocation-list mechanism. For a single user this is a few extra lines and it is the more defensible choice for financial data.
- **Secret management:** the HMAC signing secret for `setSignedCookie` must come from an environment variable (generate once, store outside git), not a hardcoded string — this is the one place a shortcut here would matter if the app is later hosted.
- **Future hosting:** because `secure`, `httpOnly`, and `sameSite` are all already explicit options on `setSignedCookie`, moving from local HTTP to a hosted HTTPS deployment is a config flip (`secure: process.env.NODE_ENV === 'production'`), not a rewrite.

**CSV Backup (export/import)**
- **Export:** a Hono route (e.g. `GET /api/backup/export`) queries all transactions via Drizzle, converts every `Decimal`-backed field (quantity, BRL value) to its **string** representation (`.toString()`, never `.toNumber()`) before handing rows to `csv-stringify`'s sync API — this preserves the exact precision that made `Decimal.js` mandatory in v1.0. Response sets `Content-Type: text/csv` and `Content-Disposition: attachment; filename=...` so the browser downloads it directly from a plain link/fetch, no client-side CSV library needed.
- **Import:** a Hono route (e.g. `POST /api/backup/import`) accepts the uploaded CSV as text, parses with `csv-parse`'s sync API, and for each row re-parses money/quantity fields back into `new Decimal(rowValue)` — never through `Number()` — before comparing/inserting.
- **Dedupe (merge, not append):** per the milestone's "exact-row-match" rule, treat a row as a duplicate only if every field matches an existing transaction (not just an ID) — this is a straightforward equality check in application code against rows fetched for that date range, run inside a single `better-sqlite3` transaction so import is atomic (all-new-rows-or-nothing on error).
- **Round-trip safety:** because export and import both go through the same field-by-field Decimal conversion, a full export→import cycle should reproduce identical rows byte-for-byte in the app's own domain values, which is what makes exact-match dedupe reliable in the first place.
- **CSV injection note (flag for later, not a new dependency):** any field that could start with `=`, `+`, `-`, or `@` (formula-injection risk if the CSV is later opened in Excel/Sheets) should be prefixed defensively on export, or at minimum this should be a documented, deliberate non-issue given the field set (dates, coin symbols, decimal amounts, exchange names) is unlikely to ever contain such characters. Worth a one-line mitigation in the export function rather than a library.

### v1.1 Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `argon2` (Argon2id, native addon) | `bcryptjs` (3.0.3, pure JS) | If native module compilation ever becomes a real blocker (it currently isn't — `better-sqlite3` already requires it) or if deploying to a constrained/serverless target without a C++ toolchain. `bcrypt` (native, 6.0.0) is a middle ground: faster than `bcryptjs`, more battle-tested than `argon2` in raw ecosystem size (5.5M vs 1.6M weekly downloads), but Argon2id is the stronger, currently-recommended default for new code. |
| Built-in `hono/cookie` + custom `sessions` table | `hono-sessions` (0.8.1) | If session needs grow beyond a single opaque token (rotation, multiple stores, sliding expiry baked in) — not needed for this milestone's stated scope. |
| `csv-parse` / `csv-stringify` (sync API) | `fast-csv` (unified parse+write, streaming) | If the transaction count ever grows large enough that loading the whole file into memory for `/sync` parsing becomes a real problem (thousands→hundreds of thousands of rows) — unlikely for a personal single-user portfolio, but `fast-csv`'s stream API is the natural upgrade path if it happens. |
| `csv-parse` / `csv-stringify` | `papaparse` | If CSV parsing needs to happen **in the browser** instead of server-side (e.g. client-side preview before upload). Papaparse is the de facto standard for browser CSV work, but for this milestone the parse/validate/dedupe logic belongs server-side next to the SQLite writes, so there's no need for a browser-side CSV library. |
| `zod` for CSV row validation | Hand-rolled validator functions | If the team wants to stay strictly consistent with the current codebase convention (no schema library in use anywhere yet) — hand-rolled validation is a perfectly valid choice here too; `zod` is offered because CSV import specifically benefits from centralized, reusable field-shape checks. |

### v1.1 What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `next-themes` | Built for Next.js's SSR/hydration dark-mode-flash problem; this is a Vite SPA with no server-rendered HTML to hydrate against a theme mismatch, so the library solves a problem this app doesn't have and adds an unnecessary dependency. | A small custom `ThemeContext` + `localStorage`, same pattern already used for the BRL/USD toggle. |
| Plaintext or reversibly-encrypted password storage | Never store or encrypt-and-decrypt a password; even for a single local user, this is financial data and the constraint explicitly calls for correct handling in preparation for future hosting. | `argon2.hash()` / `argon2.verify()` — one-way hashing only. |
| Self-contained JWT as the session mechanism | Cannot be revoked server-side without an extra denylist, and adds a JWT library + secret-rotation surface for no benefit in a single-user app. | Opaque token in a signed cookie (`setSignedCookie`) + a `sessions` row that can be deleted on logout. |
| `csv-parser` (the package, not the pattern) | Explicitly deprecated since 2023, no further security patches. | `csv-parse` (same publisher family / ecosystem as `csv-stringify`, actively maintained). |
| Building CSV rows with manual `.join(',')` string concatenation | Breaks silently the moment any field contains a comma, quote, or newline (e.g. a free-text exchange name) — no error, just corrupted/misaligned columns on the next import. | `csv-stringify`, which implements RFC 4180 quoting/escaping correctly. |
| `Number()` for any monetary/quantity field coming out of a parsed CSV row | Reintroduces the exact float-precision bug `Decimal.js` was adopted to prevent — corruption happens silently on import even though export/storage stay correct. | `new Decimal(rawCsvFieldString)` for every quantity/BRL field, symmetric with how the app already stores and computes these values. |

### v1.1 Stack Patterns by Variant

**If the app is still local-only (this milestone):**
- `secure: false` is acceptable on the session cookie for now (plain HTTP on localhost), but write the option as `secure: process.env.NODE_ENV === 'production'` from day one so hosting later is a zero-code-change deploy config flip, not a session-handling rewrite.

**If/when the app is hosted (future milestone, out of scope now but must not be foreclosed):**
- Flip `secure: true`, ensure the app sits behind HTTPS, and consider tightening `sameSite` to `'Strict'` if there's no cross-site navigation need.
- The `sessions` table + opaque-token design already supports "log out everywhere" (delete all rows for the user) without any new mechanism.

### v1.1 Version Compatibility

| Package | Compatible With | Notes |
|---------|------------------|-------|
| `argon2@0.44.0` | Node.js 20/22/23/24 | Native addon (prebuilt binaries for common platforms); same build-tooling requirement class as `better-sqlite3@12.3`, already satisfied by this project's environment. |
| `csv-parse@7.0.1`, `csv-stringify@6.8.1` | Node.js 20+, ESM and CJS both published | Same Adaltas monorepo release cadence — keep both on matching major versions when upgrading. |
| Hono cookie helper (`setSignedCookie`/`getSignedCookie`) | `hono@4.12.28` (already installed) | No version bump needed; the helper has been part of Hono core across the 4.x line. |
| Tailwind `@custom-variant` | `tailwindcss@4.3.2` + `@tailwindcss/vite` (already installed) | CSS-first config only — do not add a `darkMode` key to any config file, v4 has none. |

### v1.1 Sources

- [Tailwind CSS dark mode docs](https://tailwindcss.com/docs/dark-mode) — exact `@custom-variant dark (&:where(.dark, .dark *));` syntax confirmed directly (webfetch, LOW confidence per this project's convention, though sourced from the official docs page)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — confirms v4 support, CSS-variable architecture (websearch, LOW confidence)
- [Hono Cookie Helper docs](https://hono.dev/docs/helpers/cookie) — `setCookie`/`getCookie`/`setSignedCookie`/`getSignedCookie`/`deleteCookie` signatures and options confirmed directly (webfetch, LOW confidence per convention, official docs page)
- [GitHub: jcs224/hono_sessions](https://github.com/jcs224/hono_sessions) — `hono-sessions` feature set (encrypted cookies via iron-webcrypto, expiry, rotation) (websearch, LOW confidence)
- Password hashing 2026 guidance roundup (pkgpulse.com, reintech.io, guptadeepak.com, shattered.io) — converging recommendation for Argon2id as 2026 default, bcrypt as defensible alternative (websearch, LOW confidence — multiple independent sources converge on the same recommendation, which raises practical trust even though the tool-assigned tier stays LOW)
- npm registry direct queries (`npm view <pkg> version`) for `csv-parse` (7.0.1), `csv-stringify` (6.8.1), `argon2` (0.44.0), `bcrypt` (6.0.0), `bcryptjs` (3.0.3), `hono-sessions` (0.8.1), `zod` (4.4.3), `iron-webcrypto` (2.0.0) — versions verified as of 2026-07-17 (direct registry read, ground truth for version numbers)
- `gsd-tools query package-legitimacy check` — `argon2`, `bcrypt`, `bcryptjs`, `hono-sessions`, `iron-webcrypto`, `zod` all returned verdict `OK`. `csv-parse` and `csv-stringify` returned verdict `SUS` with reason `too-new` — this is a heuristic false positive from a recent patch-version publish (2026-07-02) on a package with 15M/8M weekly downloads and a 10+ year established repo (`adaltas/node-csv`); flagged here for transparency rather than treated as a real legitimacy concern
- npm-compare.com / leanylabs.com CSV library comparison roundups — `csv-parser` deprecated since 2023, `csv-parse`/`csv-stringify` recommended for Node server-side, `papaparse` for browser-side (websearch, LOW confidence)

---

## Sources (v1.0 baseline)

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
*Researched: 2026-07-03 (v1.0) · updated 2026-07-17 (v1.1 additions)*
