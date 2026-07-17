# Pitfalls Research

**Domain:** Adding auth (username+password, local-only), dark mode, and CSV backup export/import (merge-dedupe) to an existing single-user Brazilian crypto tax-tracking app — v1.1 milestone
**Researched:** 2026-07-17
**Confidence:** LOW-MEDIUM (web findings sourced via general web search only — no context7/official-docs access this session, so tagged LOW per the confidence classifier; codebase-specific findings are HIGH confidence, read directly from `src/db/schema.ts` and `.planning/PROJECT.md`)

> Supersedes the v1.0-era PITFALLS.md (Decimal.js/CoinGecko/IR-report pitfalls), which is archived under `.planning/milestones/`. This file covers only the three v1.1 features: auth, dark mode, CSV backup.

## Critical Pitfalls

### Pitfall 1: CSV dedupe matches on the wrong columns and silently drops or duplicates real data

**What goes wrong:**
The stated dedupe rule is "linha idêntica — todos os campos batendo." If implemented naively (compare every CSV column), it breaks two ways: (a) `transactions.id`, `createdAt`, `updatedAt` are DB-generated and will *never* match between the original row and a re-imported row, so a naive "match all columns" check always fails and duplicates every re-import; (b) if those columns are correctly excluded but `coinId`/`exchangeId` (integer FKs) are compared instead of the coin symbol / exchange name, dedupe will falsely say "different" whenever the target DB assigned different autoincrement IDs to the same coin/exchange (e.g. fresh install, reseeded lookup tables, or a coin added in a different order) — every row imports as a "new" duplicate even though it's the exact same transaction.

**Why it happens:**
"Exact row match" sounds simple but the schema mixes stable business identity (date, type, symbol, quantity, valueBrl, feeBrl, exchange name, origin) with two kinds of non-portable data: server-generated metadata (id/timestamps) and instance-local surrogate keys (coinId/exchangeId). Developers copy the DB row shape into the CSV row shape without separating "identity for dedupe" from "storage detail."

**How to avoid:**
- Export CSV using **business keys**, not surrogate IDs: coin `symbol`, exchange `name` (nullable), never `coinId`/`exchangeId`.
- Define the dedupe key explicitly as `(date, type, symbol, quantity, valueBrl, feeBrl, exchangeName, origin)` — excludes `id`, `createdAt`, `updatedAt`.
- On import, resolve `symbol`/`exchangeName` back to local `coinId`/`exchangeId` (creating the exchange row if it doesn't exist yet, per the existing seed/extend pattern; error clearly if the coin symbol isn't recognized rather than silently skipping).
- Write a unit test with two DBs seeded in different coin-insertion order to prove dedupe still matches by symbol, not by ID.

**Warning signs:** Re-importing a CSV you just exported (no changes) creates duplicate rows or, conversely, importing a genuinely new backup into a fresh DB imports zero rows because everything reads as "already exists."

**Phase to address:** CSV export/import phase (design the CSV schema and dedupe key together, before writing either export or import code).

---

### Pitfall 2: Decimal-as-TEXT round-trips through re-serialization and breaks byte-exact dedupe matching

**What goes wrong:**
`quantity`, `valueBrl`, `feeBrl` are stored as TEXT specifically so Decimal.js reads them with zero precision loss (per CLAUDE.md). If CSV export does `new Decimal(row.quantity).toString()` instead of writing the stored string directly, Decimal.js may normalize formatting (e.g. `"10.50"` → `"10.5"`, `"0.00000000"` → `"0"`, trailing-zero stripping). The DB still has `"10.50"`; the re-imported/re-exported value is `"10.5"`. If dedupe does exact string comparison, this is a permanent mismatch — every re-import of that row creates a duplicate forever. If dedupe instead does numeric equality, it "works" for dedupe but the exported CSV no longer matches what a user would expect from copy-pasting into a spreadsheet for reconciliation.

**Why it happens:** Passing a stored value through the same math library used for calculations feels natural and "safe," but Decimal.js's canonical string form is not guaranteed to equal the original stored string — it's a display/precision tool, not a serialization passthrough.

**How to avoid:**
- Export the raw TEXT column value as-is (it's already the source of truth); do not round-trip through `new Decimal(x).toString()` for export.
- If normalization is desired for readability, do it consistently in both directions (i.e., normalize on write to DB too, so DB and CSV always agree) — but simplest and safest is: never transform, just pass the string through.
- Define dedupe comparison on the **numeric value** (`Decimal(a).equals(Decimal(b))`), not raw string equality, so formatting differences (if any slip through) don't cause false "different" verdicts — this is more robust than Pitfall 1's key-column issue and should be the default comparison strategy for the two Decimal fields specifically.

**Warning signs:** Export-then-reimport-immediately test shows any diff in transaction count; visual diff of exported CSV shows trailing-zero differences from what was typed at entry time.

**Phase to address:** CSV export/import phase — write this as an explicit round-trip test (export → wipe or fresh DB → import → export again → byte-diff should be empty, or numerically-equal at minimum).

---

### Pitfall 3: Batch CSV import violates "no negative position" validation because rows aren't applied in date order

**What goes wrong:**
The existing tech debt note in PROJECT.md confirms the app already validates that a sell cannot be deleted if it has a "dependent" buy — i.e., there is a position-sufficiency invariant (can't sell more than currently held, computed from the running ledger). If CSV import inserts rows in file order (which may not be chronological — hand-edited CSVs, or multiple exchanges interleaved) and each row is validated against current state at insert time, a perfectly valid final ledger can be rejected mid-import because a `sell` row is processed before all its preceding `buy` rows, making it look like a negative-position sell.

**Why it happens:** Reusing the existing single-transaction "create" validation path for bulk import is the path of least resistance, but that path assumes each individual insert reflects a real-time, already-consistent ledger — an assumption that doesn't hold for bulk/historical replay.

**How to avoid:**
- Sort import rows by `date` (then a stable tiebreaker, e.g. original CSV row order) before insertion.
- Validate the *whole batch* atomically inside a single SQLite transaction: insert all rows, then run the existing "no negative position" check once at the end per coin, recomputing the running position chronologically (not just checking the final total, since an intermediate day could still go negative even if the final total is fine).
- Never partially commit an import — either the whole file applies or none of it does (matches "ledger integrity" expectations for financial data).

**Warning signs:** Importing a CSV that exports cleanly from another instance fails with a "can't sell more than you own" error even though the source instance's dashboard shows a valid non-negative position throughout.

**Phase to address:** CSV export/import phase. Verification: property-test-style — take any valid exported ledger, shuffle row order, re-import, confirm success and identical resulting position/cost basis.

---

### Pitfall 4: Storing passwords with a fast hash, or with bcrypt at too low a cost, for a single "keys to the kingdom" account

**What goes wrong:**
Because this is single-user, the temptation is to under-invest in password hashing ("it's just me, on my LAN"). Common concrete mistakes found in research: using `crypto.createHash('sha256')` (fast, GPU-crackable) instead of a slow hash; reusing one hardcoded salt; comparing hashes with `===` instead of constant-time comparison; logging the plaintext password during setup/debug; blocking Node's single event loop thread with synchronous hashing (`bcrypt.hashSync`) on every login request.

**Why it happens:** "Single user, local-only" is read as "low security bar," but this account gates access to complete financial records (crypto holdings, values, tax data), and the constraint doc explicitly says login is prep for future hosting — so it needs production-grade hashing from day one, not a "good enough for now" placeholder that gets forgotten.

**How to avoid:**
- Use `argon2` (argon2id) or `bcrypt` (cost ≥ 12) — either is fine for one account; OWASP's current top recommendation is Argon2id.
- Use the async API (`argon2.hash`, `bcrypt.hash`), not sync, even though there's only one user — a sync hash call blocks the entire Hono server for ~100-300ms on every login, which matters even locally if other requests are in flight (e.g. TanStack Query polling CoinGecko prices).
- Store only the library's standard encoded hash string (already includes algorithm/cost/salt) — never split these into custom columns.
- Compare using the library's own `.verify()`/`.compare()` function, never manual string equality.

**Warning signs:** Password hash column contains a fixed-length hex string (sha256 signature) instead of a `$argon2id$...` or `$2b$...` encoded string; login route uses `Sync` suffix functions.

**Phase to address:** Auth phase.

---

### Pitfall 5: Session cookie missing `Secure`/`SameSite`/`httpOnly`, or these flags accidentally left off because the app runs over plain HTTP locally

**What goes wrong:** Two opposite failure modes are both common: (1) developer sets `secure: true` while developing over `http://localhost`, the browser silently refuses to store the cookie, login appears broken, so the dev "fixes" it by hardcoding `secure: false` — and that flag never gets flipped back if/when the app is later hosted over HTTPS per the stated future-hosting goal. (2) `httpOnly` is left off "to make debugging easier from devtools," which means any XSS (e.g. via a compromised dependency in the React bundle) can read the session cookie directly and hijack the session — much higher impact for a financial app than for a typical toy app.

**Why it happens:** Local HTTP development and cookie security flags are fundamentally in tension, and there's no obvious single "always right" default when the deployment target is explicitly meant to change over time (local now, possibly hosted later, per PROJECT.md).

**How to avoid:**
- `httpOnly: true` always, no exceptions, regardless of environment.
- `sameSite: 'Lax'` always (blocks the common CSRF vectors without breaking normal navigation for a single-page local app).
- `secure` should be environment-derived, not hardcoded: e.g. `secure: process.env.NODE_ENV === 'production' || req.protocol === 'https'` — but since this milestone stays local-only over HTTP, document explicitly that `secure` is `false` for this milestone and flag it as a required flip when hosting is added later (put it in Key Decisions / a tracked follow-up, not just a code comment that gets forgotten).
- Regenerate the session identifier on successful login (not just reuse a pre-login session token) to avoid session fixation.

**Warning signs:** `secure: false` hardcoded with no environment check; cookie visible in `document.cookie` from the browser console.

**Phase to address:** Auth phase. Explicitly re-verify this control if/when a future milestone adds hosting.

---

### Pitfall 6: Dark mode flash of wrong theme (FOUC) because theme class is applied after React hydrates/renders

**What goes wrong:** If dark mode is implemented by reading `localStorage` inside a `useEffect` in a React component and then toggling a class, the page always paints once in the default (light) theme first, then flashes to dark — visible on every load/refresh for a user who prefers dark mode. This is worse than a generic FOUC because Tailwind v4 + shadcn's dark styling depends on a `.dark` class existing on `<html>` *before* any Tailwind utility classes are evaluated by the browser; a post-hydration toggle is provably too late.

**Why it happens:** React's render lifecycle (mount → effect) runs after the browser has already painted the initial HTML/CSS, so any theme decision made inside a component (rather than before the app even starts rendering) is inherently late. This bites teams who are used to "theme is just app state" mental models from other UI needs.

**How to avoid:**
- Add a small **synchronous, blocking inline `<script>`** in `index.html`'s `<head>`, before the Vite-bundled JS loads, that reads the saved preference from `localStorage` (falling back to `window.matchMedia('(prefers-color-scheme: dark)')` only if no explicit preference was ever saved — this feature is a "manual toggle," so default to light or system on the very first run) and sets `document.documentElement.classList` synchronously — before the rest of the page renders.
- Do not use a Vite-bundled/deferred script for this step; it must run before first paint, which usually means a literal `<script>` tag in `index.html`, not an imported module.
- Keep the "source of truth" for the toggle in a small React context/hook that reads the same localStorage key on mount, so subsequent toggles inside the app stay in sync — the inline script only solves the *initial paint*, not the ongoing toggle UX.

**Warning signs:** Refreshing the page with dark mode enabled shows a visible light-to-dark flash, most noticeable on slower machines or larger pages (e.g. the Dashboard with the full portfolio table).

**Phase to address:** Dark mode phase.

---

### Pitfall 7: First-run auth setup endpoint stays reachable after setup completes, or setup completion isn't atomic

**What goes wrong:** The "setup on first access, no public signup screen" flow needs a way to know whether an admin account already exists. Two common failure modes: (a) the setup endpoint/route stays permanently reachable (no check), meaning anyone who can reach the app can create/overwrite the single account at any time — effectively a hidden signup screen that defeats the entire "no public signup" decision; (b) the "is setup done?" check and the "create account" write aren't in the same transaction, so a crash or double-submit between "check: no user exists" and "insert user row" can either create two admin rows or leave the app stuck thinking setup isn't done when it partially is.

**Why it happens:** Developers often implement "if no user exists, show setup form" as a runtime check on every request rather than a single atomic DB operation, because it feels like "just a UI state," not a security boundary.

**How to avoid:**
- Gate the setup route/endpoint server-side on every request: `SELECT COUNT(*) FROM users` (or check a single-row users table) — if a user already exists, the setup route always returns 403/redirect regardless of what the frontend renders, since a frontend-only check is not a security boundary.
- Perform the "does a user exist" check and the `INSERT` inside a single SQLite transaction (or rely on a `UNIQUE` constraint that guarantees only one row can ever exist, e.g. a fixed `id = 1` primary key or unique username, and let the insert fail loudly on a race rather than silently create two accounts).
- Given single-user scope, the simplest robust design is a `users` table with a `UNIQUE` constraint on username (or a hardcoded single-row pattern) — let the DB itself be the source of truth for "setup done," not an app-level flag that can drift from reality.

**Warning signs:** Navigating directly to the setup URL after the account already exists still shows the setup form instead of redirecting to login.

**Phase to address:** Auth phase.

---

### Pitfall 8: CSV export is vulnerable to formula injection (CSV/Excel injection) via free-text fields

**What goes wrong:** Any exported field that contains user-entered free text (this schema doesn't have many, but exchange names are user-extendable, and similar fields could be added later) could start with `=`, `+`, `-`, or `@`. When the exported CSV is opened in Excel/LibreOffice/Google Sheets (a very likely thing for a "backup" file to be opened in, since it's meant to be human-portable), such a field is interpreted as a formula and can execute commands or exfiltrate data on whoever opens the file — including the app's own user, if they later re-open their own backup in a spreadsheet to eyeball it.

**Why it happens:** CSV export code usually focuses on correct escaping of commas/quotes (RFC 4180) and forgets that spreadsheet *applications*, not the CSV format itself, add a second, more dangerous layer of interpretation on top.

**How to avoid:**
- When exporting any field that isn't a controlled/known-safe value (numbers, ISO dates, enum values like `buy`/`sell`/`manual` are all safe by construction; exchange **name** is user-entered and not safe), if the value starts with `=`, `+`, `-`, `@`, tab, or CR, prefix it with a single quote `'` (or a leading space) before writing, so spreadsheet apps treat it as literal text.
- Do this consistently for both export (defense for whoever opens the file) and, defensively, treat any leading-formula-character value read back on import as literal text too (don't accidentally strip a legitimately quoted apostrophe).

**Warning signs:** An exchange name like `=1+1` (accidentally or maliciously entered) shows up as `2` when the exported CSV is opened in Excel.

**Phase to address:** CSV export/import phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Export/import raw `coinId`/`exchangeId` instead of symbol/name | Less code, direct DB dump | Breaks portability across DB instances and dedupe correctness (Pitfall 1) | Never |
| Store session in an in-memory `Map` instead of a DB/cookie-signed token | Fastest to implement | Session lost on every server restart (`--watch` dev reloads constantly); won't survive a future multi-process/hosted deployment | Only for a same-session throwaway spike, never merged |
| Skip rate limiting on the login route because "it's just me" | One less dependency | If ever hosted (explicitly the stated future path), the login route is internet-reachable with no brute-force defense from day one | Acceptable only while `secure: false`/local-only is also true; must be added before/at the hosting milestone |
| Reuse the single-transaction create/validate code path for bulk CSV import | No new validation logic to write | Rejects valid historical data due to insertion-order sensitivity (Pitfall 3) | Never for import; fine for the existing manual single-add flow |
| Client-only "is setup done" check to decide whether to show the setup screen | Simple, no extra route logic | Setup route stays a live way to (re)create/overwrite the account (Pitfall 7) | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| better-sqlite3 (existing) | Adding a `users` table via ad-hoc `ALTER TABLE`/manual SQL instead of a Drizzle migration | Add the table through `drizzle-kit` like the existing schema, keeping `schema.ts` as the single source of truth (matches existing project convention) |
| Tailwind v4 + shadcn/ui (existing) | Configuring dark mode via `tailwind.config.js` `darkMode: 'class'` (v3 pattern) | v4 is CSS-first: define `.dark` overrides and `@custom-variant dark` directly in the CSS file per shadcn's Tailwind v4 docs, no config file |
| CSV file (new) | Writing/reading CSV by hand with `split(',')` | Values can legitimately contain commas/quotes/newlines (exchange names, future notes fields) — use a proper RFC 4180-compliant CSV parser/writer rather than naive string splitting |
| CoinGecko API (existing, unrelated to this milestone but shares the request path) | None new introduced by this milestone — confirm auth middleware doesn't accidentally block the price-fetch route if it's ever called without a valid session | Scope auth middleware explicitly to user-data routes; keep price fetching working the same way it does today |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Synchronous password hashing (`bcrypt.hashSync`/no async variant) on the login route | Login requests appear to "hang" the whole server for ~100-300ms, blocking concurrent CoinGecko price polling requests | Use async hashing APIs | Noticeable even at 1 user, since Node is single-threaded and the app also does background TanStack Query polling |
| Loading the entire CSV file into memory as one big string/array before any validation | Not a real risk at this project's scale | Do not over-engineer streaming CSV parsing for a personal app; simple full-file read+parse is appropriate | Would only matter at tens of thousands of rows, far beyond a personal single-user ledger |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating "local-only" as "no auth security bar" | Account/session code written now becomes the permanent foundation once hosting is added later (explicit stated goal) — retrofitting security is riskier than building it right the first time | Build auth to the same standard as if it were internet-facing today (Pitfalls 4, 5, 7), even though the network boundary is local for this milestone |
| Not rotating/invalidating sessions on logout | A stolen cookie (e.g. from a shared machine) remains valid indefinitely | Implement an explicit logout that deletes the server-side session record (or blacklists the token), not just a client-side cookie clear |
| CSV import trusting the file's `origin` column blindly | A crafted CSV could set `origin: 'manual'` for rows that didn't come from a real manual entry, muddying data provenance (minor, but affects future exchange-import features that key off `origin`) | On import, force `origin` to a fixed value like `'backup-import'` server-side, ignoring whatever the CSV claims, so provenance stays trustworthy |
| No CSRF protection on state-changing routes once cookies exist | Once auth uses cookies (vs. today's cookie-less app), the app becomes CSRF-susceptible for any browser that still has a valid session cookie | `sameSite: 'Lax'` cookie (mitigates most cases for a same-origin SPA) is likely sufficient here since there's no cross-site form posting surface; document this as the chosen mitigation rather than skipping the question |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| CSV import gives a single opaque "0 rows imported" or generic error with no detail | User can't tell whether it worked, deduped everything correctly, or silently failed to parse | Show an import summary: rows read, rows inserted, rows skipped as duplicate, rows rejected with reason (mirrors the existing "surface clipboard failure" pattern already fixed in this codebase per recent commits — same principle: never fail silently on user-facing data operations) |
| Dark mode toggle position/persistence inconsistent between Dashboard and IR Report views | Given the existing accepted quirk where the IR year-selector resets across view switches, a similarly inconsistent theme toggle would compound user confusion about "why does state randomly change" | Persist theme in `localStorage`, read once at the app shell level (not per-view), independent of any per-view state like the year selector |
| Login screen doesn't distinguish "wrong password" from "no account exists yet / setup needed" | Confusing on first run — user unsure if this is a login form or something's broken | Server-side redirect logic (Pitfall 7) should route to setup automatically when no account exists, so the login form is only ever shown when an account already exists |

## "Looks Done But Isn't" Checklist

- [ ] **CSV export:** Often missing formula-injection escaping on free-text fields — verify by exporting a coin/exchange containing `=1+1` and opening in a spreadsheet app.
- [ ] **CSV import dedupe:** Often keyed on surrogate IDs instead of business identity — verify by importing the same CSV into two databases with coins/exchanges seeded in a different order and confirming both dedupe correctly.
- [ ] **CSV import validation:** Often validates row-by-row in file order instead of atomically/chronologically — verify by shuffling a valid export's row order before import and confirming it still succeeds.
- [ ] **Password hashing:** Often looks complete with any `bcrypt`/`argon2` call, but uses the sync variant — verify the login route uses `await`ed async hash/verify calls, not `*Sync`.
- [ ] **Session cookie:** Often looks complete with a cookie being set, but missing `httpOnly`/`sameSite` — verify via browser devtools that `document.cookie` does NOT show the session token.
- [ ] **First-run setup:** Often looks complete with a working setup form, but the route stays open after account creation — verify by hitting the setup URL again after completing setup; must redirect, not re-show the form.
- [ ] **Dark mode:** Often looks complete visually but flashes wrong theme on refresh — verify via hard refresh (not SPA navigation) with dark mode saved, watching for a light flash before dark paints.
- [ ] **CSV round-trip:** Often looks complete because export "looks right" and import "works," but decimal values silently reformat — verify with an export→import→export byte/numeric diff test on a DB containing values with trailing zeros (e.g. `"10.50"`).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Bad dedupe logic already shipped, duplicates exist in DB | MEDIUM | Write a one-off cleanup script that groups transactions by the correct business key (date, type, symbol, quantity, valueBrl, feeBrl, exchangeName, origin) and deletes all but one per group, inside a single transaction; back up the SQLite file first |
| Partial/corrupt import left the DB in a bad state (some rows inserted before a mid-import failure) | LOW (if Pitfall 3's atomic-transaction approach was followed) / HIGH (if not) | If import wasn't wrapped in a DB transaction: restore from the SQLite file backup taken before import (recommend the app always copy the `.db` file before running an import, regardless of dedupe/validation correctness, as a cheap safety net) |
| Password hashing algorithm needs to change later (e.g. bcrypt → argon2id) | LOW | Store the algorithm identifier as part of the hash string (both libraries already encode this); on successful login, re-hash with the new algorithm and update the stored value opportunistically — no forced mass migration needed for one user |
| Setup route left open, second account/overwrite created | LOW | Single-user app: simply delete/reset the `users` table and re-run setup once; no multi-tenant blast radius |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Dedupe on surrogate IDs instead of business keys (P1) | CSV export/import phase | Cross-DB import test with differently-ordered coin/exchange seeds |
| Decimal re-serialization breaks exact matching (P2) | CSV export/import phase | Export→import→export round-trip diff test with trailing-zero values |
| Batch import order breaks position validation (P3) | CSV export/import phase | Shuffled-row-order import test |
| Weak/fast password hashing (P4) | Auth phase | Code review: confirm `argon2`/`bcrypt` async API, cost/params documented |
| Missing/misconfigured cookie flags (P5) | Auth phase | Manual devtools check: cookie not readable via `document.cookie`, flags visible in response headers |
| Theme flash on load (P6) | Dark mode phase | Hard-refresh visual check with dark mode saved |
| Setup route stays open after account exists (P7) | Auth phase | Hit setup URL post-setup, confirm redirect/403 |
| CSV formula injection (P8) | CSV export/import phase | Export a field containing `=1+1`, open in a spreadsheet app, confirm literal text |

## Sources

- [Argon2 vs bcrypt 2026](https://blog.kestreltools.com/en/blog/argon2-vs-scrypt-vs-bcrypt-password-hashing-2026/) — websearch, LOW confidence
- [How to Hash Passwords Properly in Node.js](https://umbratools.dev/blog/hash-password-nodejs) — websearch, LOW confidence
- [OWASP Password Storage: Bcrypt vs Argon2id](https://www.onlinehashcrack.com/guides/password-recovery/bcrypt-vs-argon2-choosing-strong-hashing-today.php) — websearch, LOW confidence
- [Cookie Security Guide | HttpOnly, Secure, SameSite](https://barrion.io/blog/cookie-security-best-practices) — websearch, LOW confidence
- [MDN: Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies) — websearch, LOW confidence
- [Hono Cookie Helper docs](https://hono.dev/docs/helpers/cookie) — websearch, LOW confidence
- [hono_sessions (GitHub)](https://github.com/jcs224/hono_sessions) — websearch, LOW confidence
- [CSV encoding/delimiter/BOM/locale issues](https://changethisfile.com/blog/csv-encoding-delimiters) — websearch, LOW confidence
- [Solving CSV Encoding Problems: BOM UTF-8 and Excel](https://converttocsv.com/blog/csv-encoding-issues/) — websearch, LOW confidence
- [CSV injection (formula injection) vulnerability](https://www.sourcery.ai/vulnerabilities/csv-injection-vulnerabilities) — websearch, LOW confidence
- [CSV Formula Injection prevention (Node.js/Django/Flask/Java/PHP)](https://www.cyberchief.ai/2024/09/csv-formula-injection-attacks.html) — websearch, LOW confidence
- [OWASP Testing for CSV Injection](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection) — websearch, LOW confidence
- [Idempotency & Deduplication](https://www.systemdesignsandbox.com/learn/idempotency-deduplication) — websearch, LOW confidence
- [ClickHouse deduplication strategies](https://clickhouse.com/docs/guides/developer/deduplication) — websearch, LOW confidence
- [Fixing Dark Mode Flickering (FOUC) in React and Next.js](https://www.notanumber.in/blog/fixing-react-dark-mode-flickering) — websearch, LOW confidence
- [Implementing Tailwind CSS Dark Mode Toggle with No Flicker](https://cruip.com/implementing-tailwind-css-dark-mode-toggle-with-no-flicker/) — websearch, LOW confidence
- [shadcn/ui Theming docs](https://ui.shadcn.com/docs/theming) — websearch, LOW confidence
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — websearch, LOW confidence
- [OctoPrint first-run wizard admin-session race condition (GitHub issue)](https://github.com/foosel/OctoPrint/issues/1365) — websearch, LOW confidence
- [Node.js Auth Security Best Practices (2026)](https://www.authgear.com/post/nodejs-security-best-practices/) — websearch, LOW confidence
- [Prevent Brute Force Attacks in Node.js](https://medium.com/@animirr/brute-force-protection-node-js-examples-cd58e8bd9b8d) — websearch, LOW confidence
- `src/db/schema.ts` (this repo) — direct code read, HIGH confidence — source of Pitfalls 1–3, 8 (transactions store `coinId`/`exchangeId` as FKs and quantity/valueBrl/feeBrl as TEXT for Decimal.js precision; no bcrypt/argon2/csv/cookie library currently in `package.json`)
- `.planning/PROJECT.md` (this repo) — direct read, HIGH confidence — milestone scope, key decisions on auth/CSV, existing tech-debt notes on silent-failure UX pattern

---
*Pitfalls research for: Adding auth, dark mode, and CSV backup to Crypto Organizer v1.1*
*Researched: 2026-07-17*
