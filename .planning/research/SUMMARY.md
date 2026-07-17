# Research Summary: Crypto Organizer v1.1 Milestone

**Project:** Crypto Organizer — Personal crypto portfolio tracker (Brazilian IR focus)  
**Milestone:** v1.1 — Dark mode, single-user auth, CSV backup  
**Researched:** 2026-07-17 (v1.1 addendum to v1.0 baseline from 2026-07-03)  
**Confidence:** MEDIUM-HIGH (stack: MEDIUM; features: MEDIUM; architecture: MEDIUM-HIGH; pitfalls: LOW-MEDIUM)

---

## Executive Summary

The v1.0 codebase has a proven, stable foundation: Hono + React + SQLite with Decimal.js financial math, live CoinGecko price integration, and correct Brazilian IR (Bens e Direitos) reporting. The v1.1 milestone adds three independent features that collectively prepare the app for future hosting and ensure data durability: **single-user authentication** (gate all routes, enable future multi-deployment), **dark mode** (user-requested UI expectation), and **CSV backup/restore** (data loss insurance).

The three features have asymmetric complexity and interdependencies. Auth is the blocking decision: it gates all other routes and must land first. Dark mode is the widest-reaching change (touches ~14 components) but has zero data-flow coupling to auth or CSV. CSV backup is the riskiest: dedupe logic, number precision round-tripping, and batch insertion-order validation all have potential to silently corrupt data if implemented incorrectly — but the mistakes are well-documented and preventable. All three features can be built on the existing stack with no core dependencies added except `argon2`, `csv-parse`, `csv-stringify`, and Tailwind v4's CSS-first `@custom-variant` syntax (no config file).

**Key recommendation:** Land auth first (enables testing dark mode and CSV behind a login screen), then dark mode (mechanical but wide), then CSV export (read-only, lower risk), then CSV import (highest complexity, benefits from real export files to test against). **Key risk:** CSV dedupe logic keyed on surrogate IDs instead of business identity is the single highest-impact silent-data-loss bug; the same applies to Decimal number format changes during round-trip — both are preventable with explicit tests and design discipline.

---

## Key Findings

### Recommended Stack (v1.1 Additions to v1.0 Baseline)

The v1.0 stack (Node.js 22 LTS, React 19, Hono 4, Drizzle ORM, SQLite with better-sqlite3, Decimal.js) is unchanged and proven stable across 3 shipped phases. V1.1 adds only:

**Authentication:**
- `argon2` (0.44.0) — Password hashing using Argon2id (OWASP 2026 current default), async API required for non-blocking login
- Hono built-in `hono/cookie` — `setSignedCookie` / `getSignedCookie` for tamper-proof session cookies, already in `hono@4.12.28`
- Node.js built-in `node:crypto` — `randomUUID()`, `timingSafeEqual()`, no new package

**CSV Backup:**
- `csv-parse@7.0.1` — RFC 4180-compliant CSV parsing, synchronous API pairs with existing sync better-sqlite3 style
- `csv-stringify@6.8.1` — RFC 4180 CSV generation with proper quoting/escaping (no hand-rolled `.join(',')` corruption)

**Dark Mode:**
- Tailwind v4 `@custom-variant dark` CSS directive — class-based dark mode in `src/index.css`, no config file, no `next-themes` package
- React context (`ThemeProvider`) for toggle UX and `localStorage` persistence — modeled on existing `currency` toggle pattern

**Optional (not required this milestone):**
- `zod` (4.4.3) — Schema validation for CSV row parsing; add only if manual validation logic becomes unwieldy

See `STACK.md` section "v1.1 Additions" for detailed rationale, alternatives considered, and version compatibility.

### Expected Features (v1.1)

**Table Stakes (users assume these exist):**
- Dark mode manual toggle + localStorage persistence + OS preference on first load
- First-run setup screen (no public signup, one account only) and login form
- Logout that invalidates session server-side, not just client-side
- Auth protects all `/api/*` routes (no unauthenticated access)
- CSV export of all transactions in a stable, human-readable column format
- CSV import with validation, preview (import/skip/error counts), and exact-row deduplication
- Password stored as a hash, never plaintext

**Differentiators (nice to have, low cost):**
- UTF-8 BOM on CSV export for Excel on Windows (PT-BR accented names)
- Long-lived session (days, not fintech-style 5-min timeouts) for a trusted local app
- Manual password-recovery path (optional: script to reset hash and re-trigger setup)

**Defer to v2+:**
- Exchange-native CSV import (Binance, Mercado Bitcoin formats)
- Public/multi-user auth, hosted deployment with stricter session policy
- Theme customization beyond light/dark

See `FEATURES.md` "v1.1 Milestone Addendum" for feature prioritization matrix and anti-features.

### Architecture Approach (v1.1)

Three new patterns for v1.1; the v1.0 architecture (append-only ledger, recompute-on-read positions, price isolation) is unchanged:

1. **Route-order-as-access-control:** Register unauthenticated routes (`/api/health`, `/api/auth/*`) first, then `app.use('/api/*', authMiddleware)`, then all protected routes. Hono middleware executes in registration order — no config file, no separate allowlist to drift; layout *is* the security boundary.

2. **Signed cookie + server-side session record:** Generate a random session ID on login, store it (with expiry) in a `sessions` table with a signed HMAC cookie. This is revocable (logout deletes the session row) unlike stateless JWT, and it's the pattern already validated for prep-for-hosting.

3. **CSS-variable-free dark mode via `@custom-variant`:** Add one line to `src/index.css`: `@custom-variant dark (&:where(.dark, .dark *));` then retrofit components by adding paired `dark:` classes. This is mechanical, wide, and low-risk.

4. **CSV export/import with business-key deduplication:** Export uses coin `symbol` and exchange `name`, not surrogate IDs. Import resolves these back to local IDs, deduplicates on exact content match, and all inserts happen in a single SQLite transaction.

See `ARCHITECTURE.md` "v1.1 Milestone Addendum" for detailed patterns and data flow.

### Critical Pitfalls

**Eight critical pitfalls identified; top three by impact:**

1. **CSV dedupe keyed on surrogate IDs instead of business identity** — Silent duplicates on every re-import. *Fix:* Export symbol + exchange name. Dedupe on (date, type, symbol, quantity, valueBrl, feeBrl, exchangeName, origin). Test by importing same CSV into two databases with coins/exchanges seeded in different order.

2. **Decimal format changes during round-trip break exact-match dedupe** — Permanent duplicates if `"10.50"` becomes `"10.5"` after normalization. *Fix:* Export raw TEXT values as-is. Define dedupe on numeric value (`Decimal(a).equals(Decimal(b))`), not raw string. Write export→import→export round-trip test.

3. **Batch CSV import violates position validation because rows aren't applied in date order** — Valid historical ledgers rejected mid-import. *Fix:* Sort by date before insertion. Validate entire batch atomically. Never partially commit.

**Other critical pitfalls:**
- Pitfall 4: Fast/weak password hashing or sync API blocking server on login → use async argon2/bcrypt, cost ≥ 12
- Pitfall 5: Session cookie missing `httpOnly`, `secure`, or `sameSite` → explicit options on `setSignedCookie`, always include
- Pitfall 6: Dark mode flash of unstyled content (FOUC) → blocking inline `<script>` in `index.html` `<head>` before first paint
- Pitfall 7: First-run setup endpoint stays reachable after setup → gate route server-side on every request
- Pitfall 8: CSV export vulnerable to formula injection (`=`, `+`, `-`, `@`) → prefix with space or quote before export

See `PITFALLS.md` for verification checklists, recovery strategies, and integration gotchas.

---

## Implications for Roadmap

Based on research dependencies and risk profile, v1.1 should be executed in four phases:

### Phase 1: Single-User Auth (foundation)

**Rationale:** Auth is the only feature that changes cross-cutting behavior. Landing it first means dark mode and CSV backup phases are built and tested *behind* the login screen.

**Delivers:**
- First-run setup flow, login form, logout with session revocation
- Password hashing with Argon2id (async API)
- Signed session cookies (httpOnly, sameSite, secure config ready for future hosting)
- `sessions` table + `auth_credentials` table in SQLite
- Hono `authMiddleware` checking session validity
- Protected `/api/*` routes, public `/api/auth/*` routes

**Uses:** `argon2`, Hono `hono/cookie`, Node `node:crypto`, Drizzle ORM

**Avoids:** Pitfalls 4 (weak hashing), 5 (missing cookie flags), 7 (setup route stays open)

**Research flags:** None — well-documented patterns, Hono official docs verified.

---

### Phase 2: Dark Mode (wide, mechanical)

**Rationale:** Independent of auth and CSV (no data-flow coupling). High visible impact but lowest functional complexity. Sequencing after auth means login screen is dark-aware from start.

**Delivers:**
- Tailwind v4 `@custom-variant dark` CSS directive
- ThemeProvider + useTheme hook
- ModeToggle component (sun/moon/system dropdown)
- Paired `dark:` classes retrofitted across ~14 components
- Theme persisted in localStorage (no FOUC on hard refresh)

**Uses:** Tailwind v4 `@custom-variant`, React context, localStorage

**Avoids:** Pitfall 6 (FOUC)

**Research flags:** None — official docs verified.

---

### Phase 3: CSV Export (read-only, lower risk)

**Rationale:** Export is read-only and lower-risk than import. Produces real backup files for import phase testing.

**Delivers:**
- GET `/api/backup/export.csv` route (behind auth)
- CSV with all transaction fields (coin symbol, exchange name, not IDs)
- Content-Disposition header for browser download
- UTF-8 with optional BOM
- Formula-injection escaping on free-text fields

**Uses:** `csv-stringify`, Drizzle ORM (existing queries)

**Avoids:** Pitfall 8 (formula injection)

**Depends on:** Phase 1 (auth middleware)

**Research flags:** None — straightforward; `csv-stringify` handles RFC 4180 correctly.

---

### Phase 4: CSV Import with Validation & Dedupe (highest complexity, most risk)

**Rationale:** Most complex feature (untrusted input, dedupe, FK resolution). Depends on Phase 3's export format as single source of truth.

**Delivers:**
- POST `/api/backup/import` route (behind auth) accepting CSV upload
- Row-by-row parsing with Decimal.js (never through `Number()`)
- FK resolution: symbol → `coinId`, exchange name → `exchangeId`
- Dedupe on exact content match (date, type, symbol, quantity, valueBrl, feeBrl, exchangeName, origin)
- Import preview: rows read, inserted, skipped, rejected with reasons
- User confirmation before committing
- Atomic transaction: all-or-nothing
- Row sorting by date (validates position sufficiency chronologically)
- Origin field forced to `'csv-import'` server-side

**Uses:** `csv-parse`, Drizzle ORM, Decimal.js, existing transaction-creation validation (reused)

**Avoids:** Pitfalls 1–3 (dedupe, decimal format, batch-order validation)

**Depends on:** Phase 1 (auth), Phase 3 (export format)

**Verification required:**
- Round-trip test: export → wipe DB → import → verify equivalence
- Cross-instance dedupe: import same CSV with different coin/exchange seed order
- Shuffled-order import: re-order rows, confirm success
- Negative-position test: move sell before buy, confirm atomic rejection

**Research flags:** CSV import logic is sound but needs verification: (1) Ensure transaction-create path can be reused from import; (2) Document dedupe key explicitly as contract; (3) Write verification tests before landing.

---

### Phase Ordering Rationale

1. **Auth first** → enables realistic testing of other phases; avoids retrofit risk
2. **Dark mode second** → wide surface (mechanical, low risk); login screen dark-aware from start
3. **CSV export third** → read-only, lower risk; produces real files for import testing
4. **CSV import fourth** → highest complexity; benefits from export files; depends on export format

**Within CSV:** Before Phase 4 planning, check whether existing `routes/transactions.ts` create-transaction path can be called directly per CSV row (reuse validation), or whether logic needs extracting to `src/engine/`. This is a reading task only.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | MEDIUM-HIGH | v1.0 baseline proven (HIGH); v1.1 additions well-established packages (MEDIUM) with versions verified directly against npm registry (MEDIUM-HIGH). No novel choices. |
| **Features** | MEDIUM | Feature set explicitly decided in PROJECT.md (HIGH). Definitions clear, MVP-scoped (MEDIUM). Complexity estimates based on websearch + codebase inspection (MEDIUM). |
| **Architecture** | MEDIUM-HIGH | Auth patterns (route-order, signed cookies, DB sessions) are industry-standard, Hono docs verified (MEDIUM-HIGH). Dark mode confirmed via Tailwind v4 + shadcn docs (MEDIUM-HIGH). CSV patterns sound but execution-dependent (MEDIUM — dedupe is high-risk). Codebase integration read directly (HIGH). |
| **Pitfalls** | LOW-MEDIUM | Password hashing sourced via websearch (LOW, needs OWASP verification). CSV pitfalls well-researched (MEDIUM-HIGH). Dark mode cross-checked (MEDIUM-HIGH). Aggregated as LOW-MEDIUM due to password-hashing gap. |

**Overall confidence: MEDIUM** — Stack and architecture patterns are solid. V1.1 introduces significant implementation complexity (especially CSV dedupe). Execution risk is high because small mistakes have silent, data-corrupting consequences.

### Gaps to Address

1. **Password hashing library choice finalization** — Currently suggests `argon2` (OWASP 2026 default), `bcrypt` as fallback. *Handle in planning:* Verify against [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Finalize before Phase 1 planning.

2. **CSV round-trip test infrastructure** — Phase 4 requires property-test-style verification (export → wipe → import → export; diff should be empty). *Handle in planning:* Set up reusable test fixture. Also required: cross-instance dedupe test and shuffled-order import test.

3. **Integration point: transaction-creation reuse** — Before Phase 4 planning, inspect `routes/transactions.ts` to check whether create-transaction path can be called directly from import per-row, or whether logic needs extracting. This is a "read and decide" task.

4. **Decimal.js round-trip semantics** — Verify whether `new Decimal("10.50").toString()` equals the original or changes formatting. *Handle in planning:* Simple test during Phase 3; if formatting differs, document rule and apply consistently on both export/import.

---

## Sources

### Primary (HIGH confidence)

- `src/server/index.ts`, `src/db/schema.ts`, `src/api/client.ts`, `src/App.tsx`, `src/index.css`, `package.json` — Direct codebase read
- `.planning/PROJECT.md` — Direct project read (milestone scope and constraints)
- `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` — Research deliverables

### Secondary (MEDIUM confidence)

- [Hono Cookie Helper docs](https://hono.dev/docs/helpers/cookie) — WebFetch verification
- [Tailwind CSS Dark Mode (v4)](https://tailwindcss.com/docs/dark-mode) — WebFetch verification
- [shadcn/ui Tailwind v4 guide](https://ui.shadcn.com/docs/dark-mode/vite) — WebFetch verification
- npm registry direct queries — Versions verified 2026-07-17

### Tertiary (LOW confidence, needs validation)

- Argon2id vs bcrypt 2026 guidance — Websearch (LOW). *Recommendation:* Cross-check against OWASP before finalizing.
- CSV injection prevention — Websearch (LOW). *Recommendation:* Verify against OWASP CSV Injection testing guide.

---

*Research synthesis: Crypto Organizer v1.1*  
*Completed: 2026-07-17*  
*Status: Ready for roadmap creation*
