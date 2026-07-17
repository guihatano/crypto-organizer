# Feature Research

**Domain:** Personal crypto portfolio tracker — Brazil tax / Bens e Direitos focus
**Researched:** 2026-07-03 (v1.0) + 2026-07-17 (v1.1 milestone addendum below)
**Confidence:** MEDIUM (v1.0: Brazilian tax rules cross-checked against multiple Brazilian sources; tracker feature set from market analysis of Koinly, CoinTracker, CoinStats, CoinTracking) / LOW (v1.1 addendum: websearch-only, no curated sources — see that section)

---

## Brazilian Tax Rules Reference

These rules drive the core data model and every calculation in this app. Get them wrong and the tool is actively harmful.

### Preço Médio (Weighted Average Cost)

**Formula:** `preço_médio = (sum of all buy amounts including fees) / total quantity held`

- Fees are INCLUDED in the acquisition cost.
- Adding more of the same coin updates the weighted average: `new_preço_médio = (old_total_cost + new_purchase_cost) / new_total_qty`.
- **Selling does NOT change the preço médio (unit cost).** This is the core Brazil-specific rule that differs from FIFO.

**On partial sale:**
- `cost_of_sale = preço_médio × qty_sold`
- `new_total_cost = old_total_cost - cost_of_sale` (i.e., `preço_médio × remaining_qty`)
- The unit preço médio remains unchanged.
- Capital gain = `sale_proceeds - cost_of_sale`

**Sources:** [Blocktrends IR 2026](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-renda-2026/), [Nubank IR guide](https://blog.nubank.com.br/como-declarar-criptomoedas-imposto-de-renda/), [declarandobitcoin.com.br](https://www.declarandobitcoin.com.br/post/venda-permuta-e-transfer%C3%AAncia-quais-opera%C3%A7%C3%B5es-geram-imposto-em-criptomoedas)

### Bens e Direitos Declaration

- **Where:** Ficha "Bens e Direitos", Group 08 (Criptoativos)
- **Codes:** 01 = Bitcoin, 02 = Ether, 03 = Altcoins, 10 = Stablecoins, 99 = Other (NFTs, tokens)
- **What to declare:** Acquisition cost in BRL as of December 31 of the prior year — NOT market value, NOT current price.
- **Threshold:** Declare only if acquisition cost of a given asset type is **R$5,000 or more**. The threshold is per-asset-type (BTC and ETH counted separately). If BTC cost > R$5k and ETH cost < R$5k, declare BTC only.
- **Dec 31 snapshot:** Report what you held on December 31 with the total cost you paid. The value does not change due to market fluctuations.
- **Discriminação field:** Asset name + quantity + custodian name + custodian CNPJ.

**Sources:** [Blocktrends IR 2026](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-renda-2026/), [CoinTracker Brazil guide](https://www.cointracker.io/blog/brazil-crypto-tax-guide), [KoinX Brazil guide](https://www.koinx.com/tax-guides/declare-crypto-tax-return-brazil)

### Capital Gains (Out of Scope for v1 — reference only)

- Monthly disposals under R$35,000: gains are exempt (report under "Rendimentos Isentos e Não Tributáveis").
- Monthly disposals over R$35,000: gains taxable at 15–22.5% progressive rates.
- Not the v1 focus. Mentioned here because users may ask for it.

---

## Feature Landscape (v1.0)

### Table Stakes (Users Expect These)

Features that make the tool usable. Missing any of these = broken product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Buy transaction entry | Core workflow: record purchases across exchanges | LOW | Fields: date, coin (ticker), quantity, total BRL paid (or unit price), fees in BRL, exchange name |
| Sell transaction entry | Core workflow: record disposals | LOW | Fields: date, coin, quantity, total BRL received, fees in BRL, exchange name; triggers cost recalculation |
| Transaction history list | Users need to see, verify, and correct their records | LOW | Sortable by date; show all buys and sells; pagination or infinite scroll |
| Edit / delete transaction | Data entry errors are inevitable with manual entry | LOW | Must recalculate all derived values after edit |
| Per-coin position view (holdings) | The central "what do I own?" screen | LOW | Columns: coin, quantity held, total acquisition cost (custo de aquisição), preço médio |
| Correct preço médio calculation | Wrong formula = wrong IR declaration; uniquely important for Brazil | MEDIUM | Weighted average across all buys; fees included; selling does NOT change unit cost; must recalculate on every buy/sell |
| Proportional cost reduction on sell | Other side of the Brazil-specific rule | MEDIUM | new_total_cost = preço_médio × remaining_qty; verified against multiple BR sources |
| Current price fetch via API | Users want to see portfolio value today | LOW | CoinGecko free demo API (30 req/min, 10k/month); on-demand or periodic refresh; graceful degradation when API down |
| Market value per coin | Combines quantity × current price | LOW | Depends on price fetch; must show "price unavailable" gracefully |
| Unrealized P&L per coin | The "how am I doing?" metric | LOW | (current_price × qty) - total_acquisition_cost; show in BRL and as % |
| Exchange / source tagging per transaction | Core user need: "where did I buy this?" | LOW | Free-text or dropdown of known exchanges (Binance, Coinbase, Mercado Bitcoin, etc.) |
| Bens e Direitos report | The primary IR deliverable | MEDIUM | Per-coin: total acquisition cost as of Dec 31, with R$5k threshold flag; must use year-end position not today's |

### Differentiators (Competitive Advantage)

Features that set this product apart for a Brazil-focused personal user. Not required for launch, but high value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Year-selectable Dec 31 snapshot | User can generate Bens e Direitos for any past year, not just the current one | MEDIUM | Requires replaying all transactions up to Dec 31 of chosen year; important if user has old transactions to catch up on |
| R$5,000 threshold indicator | Auto-highlights which coins must be declared vs which are below the threshold | LOW | Purely display logic on top of existing cost data |
| Discriminação text auto-generator | One-click copy of the full discriminação field text ready to paste into IRPF program | LOW | Template: "{qty} unidades de {coin} mantidas na exchange {exchange} (CNPJ {cnpj})" |
| Portfolio summary dashboard | Total invested vs total market value vs total unrealized P&L | LOW | Aggregate across all coins; satisfying to look at |
| Month-by-month transaction view | Helps user remember and audit what happened when | LOW | Group transaction history by month |
| Graceful API degradation | IR and cost data remain fully usable when price API is offline | LOW | Fetch prices separately from cost data; show stale-price warning |
| Multi-year tracking | Keep history across multiple declaration cycles | LOW | Design the data model to be year-agnostic from day one — don't scope it per year |

### Anti-Features (Deliberately NOT Built for v1)

Features that seem useful but must be deferred or avoided to keep scope manageable.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Exchange API integration (auto-import) | "I don't want to type everything" | Each exchange has a different API, authentication model, rate limits, and data format; maintenance burden is very high | Manual entry for v1; consider CSV import as a v1.x feature |
| CSV import from exchanges | "Faster than manual entry" | Each exchange exports differently; parsing is brittle; edge cases with corporate actions, fees embedded in price, etc. | Manual entry now; add CSV import as a future phase once core logic is stable |
| Capital gains / DARF calculation | "I want to know if I owe tax this month" | Complex: requires monthly aggregation, R$35k threshold tracking per month, correct cost matching per lot; different tax treatment for different asset types; out of scope | Out of scope v1; could be a dedicated v2 milestone |
| PDF / printable tax report | "I want a document to give my accountant" | Layout work, PDF generation libraries, formatting complexity | Instead export the data as a simple table the user can copy; the IRPF program is where the official report lives |
| Real-time price streaming / websocket | "I want live prices" | Unnecessary for a tax tool; adds infra complexity; single-user tool doesn't need sub-second updates | On-demand price refresh when user opens the app or clicks a refresh button |
| Multi-user / authentication | "My spouse also wants to use it" | Changes the security model entirely; session management, multi-tenancy in data model; contradicts local-first design | Single-user; if sharing is needed later, add a login layer as a separate milestone — **this happened: see v1.1 addendum below** |
| Altcoin / token discovery / search across all coins | "I hold a new DeFi token" | Unreliable price feeds for obscure tokens; high maintenance; scope creep | Restrict to coins with reliable CoinGecko coverage; user manually enters coin ID if needed |
| Mobile native app | "I want to enter trades from my phone" | Two separate codebases; v1 is web-first local | Responsive web design is sufficient; a PWA could be a v1.x enhancement |
| NFT tracking | "I have NFTs too" | NFTs have no reliable price feed; unique valuation; completely different data model | Explicitly out of scope; focus on fungible crypto assets |
| Staking / yield / rewards tracking | "I earn yield on my holdings" | Staking income has different tax treatment; complex to model; each protocol differs | Not in scope v1; treat staking rewards as separate buy transactions if user wants to record them manually |

---

## Feature Dependencies (v1.0)

```
[Transaction entry: Buy]
    └──requires──> [Coin registry / known coins list]
    └──enables──>  [Preço médio calculation]
                       └──enables──> [Per-coin position view]
                                        └──enables──> [Bens e Direitos report]
                                        └──enhances──> [Market value + unrealized P&L]

[Transaction entry: Sell]
    └──requires──> [Preço médio calculation]  (to compute new total cost after sale)
    └──updates──>  [Per-coin position view]

[Current price fetch]
    └──enhances──> [Market value + unrealized P&L]
    └──must NOT block──> [Bens e Direitos report]  (IR data is cost-based, not price-based)

[Transaction history list]
    └──requires──> [Transaction entry: Buy]
    └──requires──> [Transaction entry: Sell]
    └──enables──>  [Edit / delete transaction]

[Year-selectable Dec 31 snapshot]  (differentiator)
    └──requires──> [Transaction history list]
    └──requires──> [Preço médio calculation]  (must be replayable at arbitrary date)

[Discriminação auto-generator]  (differentiator)
    └──requires──> [Bens e Direitos report]
    └──requires──> [Exchange / source tagging per transaction]
```

### Dependency Notes

- **Preço médio calculation requires correct transaction entry:** The calculation depends on buy date, quantity, and total BRL paid (including fees). All three must be captured at entry time.
- **Bens e Direitos report must NOT require price API:** The Dec 31 acquisition cost is pure accounting data. Price API failure must never block generating the IR report.
- **Year-selectable snapshot requires replayable calculation:** The calculation engine must be able to replay the transaction log from the beginning up to any date. This means the data model should store all transactions chronologically with a timestamp rather than just storing a running balance.
- **Edit/delete requires full recalculation:** Changing any transaction in the history must recompute preço médio and total cost for all subsequent transactions on that coin.

---

## MVP Definition (v1.0)

### Launch With (v1)

Minimum viable product — what is needed to replace the user's current spreadsheet.

- [x] Buy transaction entry (date, coin, qty, total BRL paid, fees, exchange) — the primary input
- [x] Sell transaction entry (date, coin, qty, total BRL received, fees, exchange) — with proportional cost reduction
- [x] Transaction history list with edit and delete
- [x] Per-coin position view: quantity held, total acquisition cost (custo de aquisição), preço médio
- [x] Correct preço médio calculation following Brazilian rules (fees included, unit cost unchanged on sell)
- [x] Current price fetch via CoinGecko (on demand; degrade gracefully if unavailable)
- [x] Market value and unrealized P&L per coin
- [x] Bens e Direitos report: acquisition cost per coin as of Dec 31 (user selects year), with R$5k threshold flag
- [x] Exchange / source tag per transaction

*(All shipped in v1.0, 2026-07-17. See `.planning/PROJECT.md` and `.planning/milestones/v1.0-*.md`.)*

### Add After Validation (v1.x) — this is now the v1.1 milestone

- [ ] Discriminação text auto-generator — shipped v1.0 Phase 3
- [ ] Portfolio summary dashboard — shipped v1.0 Phase 2
- [ ] R$5k threshold indicator — shipped v1.0 Phase 3
- [ ] **Dark mode, auth, CSV backup — this milestone (v1.1); see addendum below**

### Future Consideration (v2+)

Features to defer until after v1.1.

- [ ] CSV import from exchanges (Binance-native format etc.) — different, larger feature than the v1.1 backup-CSV; validate backup import first
- [ ] Capital gains / R$35k monthly tracking — different problem; own milestone
- [ ] Hosted deployment with public-facing security hardening — v1.1 adds local auth as prep, not hosting itself
- [ ] DARF generation — requires capital gains first

---

## Feature Prioritization Matrix (v1.0)

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Buy transaction entry | HIGH | LOW | P1 |
| Sell transaction entry | HIGH | LOW | P1 |
| Correct preço médio (Brazil rules) | HIGH | MEDIUM | P1 |
| Per-coin position view | HIGH | LOW | P1 |
| Transaction history + edit/delete | HIGH | LOW | P1 |
| Bens e Direitos report (Dec 31 snapshot) | HIGH | MEDIUM | P1 |
| Exchange source tag per transaction | HIGH | LOW | P1 |
| Current price via CoinGecko API | MEDIUM | LOW | P1 |
| Market value + unrealized P&L | MEDIUM | LOW | P1 |
| Graceful API degradation | HIGH | LOW | P1 |
| R$5k threshold indicator | MEDIUM | LOW | P2 |
| Discriminação auto-generator | MEDIUM | LOW | P2 |
| Portfolio summary dashboard | MEDIUM | LOW | P2 |
| Year-selectable Dec 31 snapshot | HIGH | MEDIUM | P2 |
| CSV import | MEDIUM | HIGH | P3 |
| Capital gains / DARF | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis (v1.0)

| Feature | Koinly | CoinTracker | This App |
|---------|--------|-------------|----------|
| Manual transaction entry | Yes | Yes | Yes — primary input method |
| Exchange API sync | 700+ exchanges | 170 auto + 370 CSV | Explicitly out of scope v1 |
| Portfolio view | Yes | Paid only | Yes, free (single user) |
| Average cost basis | ACB + FIFO + LIFO | ACB + FIFO | Brazil-specific weighted avg (preço médio) only |
| Brazil IR / Bens e Direitos | No native support | No native support | Core differentiator |
| R$5k threshold flag | No | No | Yes |
| Dec 31 snapshot | No | No | Yes |
| Tax report generation | Paid | Paid | Out of scope v1 |
| Local / offline use | No | No | Yes (local-first) |
| Multi-user | Yes | Yes | No (single user — feature, not bug) |

**Key insight:** No mainstream tracker offers native Bens e Direitos support. The Dec 31 acquisition cost snapshot for Brazilian IR is the core differentiator that justifies building a custom tool instead of using Koinly or CoinTracker.

---

## Sources (v1.0)

- [Blocktrends: Como declarar criptomoedas IR 2026](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-renda-2026/)
- [Nubank: Como declarar criptomoedas no IR](https://blog.nubank.com.br/como-declarar-criptomoedas-imposto-de-renda/)
- [CoinTracker: Brazil crypto tax guide](https://www.cointracker.io/blog/brazil-crypto-tax-guide)
- [CoinLedger: Brazil crypto tax](https://coinledger.io/blog/brazil-crypto-tax)
- [KoinX: How to declare crypto in Brazil](https://www.koinx.com/tax-guides/declare-crypto-tax-return-brazil)
- [declarandobitcoin.com.br: Venda, permuta e transferência](https://www.declarandobitcoin.com.br/post/venda-permuta-e-transfer%C3%AAncia-quais-opera%C3%A7%C3%B5es-geram-imposto-em-criptomoedas)
- [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing)
- [CoinGecko rate limit FAQ](https://support.coingecko.com/hc/en-us/articles/4538771776153-What-is-the-rate-limit-for-CoinGecko-API-public-plan)
- [Koinly vs CoinTracker comparison](https://koinly.io/compare/cointracker-vs-koinly/)
- [DEXTools: What is a crypto portfolio tracker 2026](https://www.dextools.io/tutorials/what-is-a-crypto-portfolio-tracker-guide-2026)

---

# v1.1 Milestone Addendum: Dark Mode, Auth, CSV Backup

**Domain:** Personal/single-user local finance app — v1.1 milestone (dark mode, auth, CSV backup)
**Researched:** 2026-07-17
**Confidence:** LOW (all findings from general web search; no official docs or curated sources were available/hit cache for this milestone — treat as directional, verify against Hono/OWASP docs at implementation time)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist once these 4 capabilities are on the table. Missing these = the feature feels half-built.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dark mode manual toggle | Standard in any 2026 web app; user explicitly asked for it | LOW | Toggle button + persisted choice. No dependency on transaction schema — fully independent of the other 3 features. |
| Dark mode persists across reload | A toggle that resets on refresh feels broken | LOW | `localStorage` is the standard mechanism; read on app boot before first paint to avoid flash-of-wrong-theme. |
| Dark mode defaults to OS preference on first visit | Users expect first-load theme to match their system, only diverging after they explicitly toggle | LOW | `window.matchMedia('(prefers-color-scheme: dark)')` as the *initial* value only; explicit toggle always wins after that and gets persisted. |
| First-run setup screen (no login form until an account exists) | Since there's no public signup, the app needs some way to create the one account | LOW–MEDIUM | Detect "no user row in DB" → show a one-time "create your username/password" screen instead of a login form. Once a user row exists, that screen must never be reachable again (route guard, not just hidden button). |
| Login form (username + password) | Baseline expectation once auth exists at all | LOW | Standard form, server validates against stored hash, sets session cookie. |
| Logout action that fully clears the session | Users expect logout to actually log them out | LOW | Must clear the cookie server-side (invalidate/delete session) and client-side, not just hide the UI. |
| Password stored hashed, never plaintext | Baseline security expectation, non-negotiable even for local-only | LOW | bcrypt or Argon2id (see complexity discussion in Dependencies/Notes below). |
| Auth protects all data routes, not just the login page | Otherwise auth is theater — API routes for transactions/report/CSV must require a valid session too | LOW–MEDIUM | Apply as Hono middleware on the API router, not per-handler; easy to forget one route otherwise. |
| CSV export of all transactions | This *is* the backup feature — must cover every transaction field currently in the schema | LOW | One row per transaction: id, date, tipo (compra/venda), moeda, quantidade, valor_brl, exchange (nullable), created_at. Straight dump of the existing table — no aggregation. |
| CSV export uses a stable, self-defined column format | Import must be able to round-trip what export produced | LOW | Export format = import format. This is a backup/restore pair for *this app's own data*, not a generic exchange-CSV importer (that's explicitly out of scope per PROJECT.md). |
| CSV import validates before committing anything | Users expect bad data to be rejected, not silently corrupt their portfolio | MEDIUM | Validate structure (headers match, column count) and per-row data (valid date, valid coin, numeric quantity/value) before writing anything to the DB. |
| CSV import shows what will happen before committing | Blind "upload and hope" is not acceptable for financial data | MEDIUM | Preview: N rows to import, M rows skipped as duplicates, any rows with errors and why — user confirms before the write happens. |
| CSV import dedupes on reimport (no duplicate transactions) | Explicitly decided in PROJECT.md — importing the same backup twice must not double every position | MEDIUM | Dedupe by exact match across all fields (already decided). Reuses the same insert path as manual entry so preço médio math stays correct — do not build a parallel insert path. |

### Differentiators (Nice, Not Required for This Milestone)

Not required to hit the milestone goal, but cheap enough to consider bundling in.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Remember me" / long-lived session (vs. bank-style 5–10 min timeout) | This is a trusted, local-only, single-user tool — short OWASP-style financial-app timeouts (2–10 min) are the *wrong* pattern to copy here and would just annoy the one person using it | LOW | Recommend a long session (days/weeks) with a visible logout button, not aggressive auto-expiry. Revisit only if/when the app is actually hosted publicly (already flagged in PROJECT.md as a future step). |
| CSV export includes UTF-8 BOM | Excel on Windows (common in BR) misreads UTF-8 CSVs without a BOM, garbling accented coin/exchange names | LOW | Small, one-line fix; worth doing since values may include PT-BR text (exchange names). |
| Import error report is downloadable/copyable | Nice for a user debugging a hand-edited CSV, but low value at single-user scale | LOW | Defer unless the on-screen preview proves insufficient. |

### Anti-Features (Commonly Requested, Often Problematic — Do Not Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Public signup / multi-user accounts | "Feels more complete" as a generic auth system | Directly contradicts PROJECT.md scope (single user, no public signup); adds real attack surface for zero value here | First-run setup creates the one account; no registration route exists at all |
| Email-based password reset flow | Standard SaaS pattern | No email infrastructure in a local-only app; building it is disproportionate for one user who has shell/DB access to their own machine | Document a manual recovery path instead: a small script/DB command to clear the stored password hash and re-trigger first-run setup. Flag this as an open decision for requirements-writer, not silently build email flow. |
| Bank-grade short idle session timeout (2–10 min) copied from fintech guidance | Feels "more secure" because financial data is involved | This app is local-only, single-user, no public exposure yet; a 5-minute auto-logout on your own home network is pure friction with no attacker to stop | Longer session (see Differentiators above); revisit if/when hosted online |
| Generic CSV importer with column-mapping UI (map arbitrary exchange CSV headers to app fields) | Sounds like "the same feature, just more flexible" | This is explicitly Out of Scope in PROJECT.md — a different, much bigger feature (per-exchange format handling) than the backup import decided for this milestone | Import only accepts the app's own export format; exchange-native import is a separate, deferred feature |
| Theme customization beyond light/dark (custom accent colors, multiple themes) | "While we're doing dark mode, why not..." | Scope creep on a milestone explicitly framed as "manual toggle, persisted" — nothing more was requested | Two themes only: light and dark |
| Automatic time-of-day theme switching | Some apps do this | Not requested; conflicts with "manual toggle" framing in PROJECT.md, and auto-switching while a user is mid-task is often experienced as a bug | OS-preference as the default on first load only; explicit toggle after that, never auto-changes again |

## Feature Dependencies

```
Auth (setup + login + session)
    └──gates──> all existing routes (transactions, dashboard, IR report)
    └──gates──> CSV export route
    └──gates──> CSV import route

CSV export (column format)
    └──defines format for──> CSV import (must parse what export produces)

CSV import
    └──requires──> existing transaction insert/validation logic (reused, not duplicated)
    └──requires──> dedupe rule (exact-row match) — already decided in PROJECT.md

Dark mode
    (no dependency on the other 3 — fully independent, can ship in any order)
```

### Dependency Notes

- **Auth gates everything else:** every existing API route (transactions, dashboard, IR report) and both new CSV routes need to sit behind the session middleware. This is the one feature with the widest blast radius — plan it first or in parallel with, not after, the others, so the other three don't get built against unauthenticated routes and need rework.
- **CSV export must be finalized before/alongside CSV import:** since import only needs to parse the app's own export format (not a generic exchange format), the column layout is a single shared contract. Design it once.
- **CSV import reuses existing transaction write path:** dedupe + insert should go through the same logic that already enforces the Brazilian preço médio math (Decimal.js, sells never altering unit cost) — do not build a second insert path that could drift from the manual-entry one and corrupt calculations.
- **Dark mode has zero coupling to auth/CSV/schema:** it can be built and shipped independently of the other three, in any order, including in parallel.

## MVP Definition (for this milestone)

### Launch With (v1.1)

All four features are already committed in PROJECT.md; "MVP" here means the minimum shape of each that satisfies the milestone goal without gold-plating:

- [ ] Dark mode: manual toggle, localStorage-persisted, OS-preference default on first load
- [ ] Auth: first-run setup (username+password, one account only), login, logout, session middleware protecting all data routes, hashed password storage
- [ ] CSV export: one button, dumps all transactions in the app's own defined column format, UTF-8 (with BOM for PT-BR Excel compatibility)
- [ ] CSV import: upload → validate → preview (import/skip/error counts) → confirm → merge into existing data with exact-row dedupe

### Add After Validation (v1.x)

- [ ] Manual password-reset/recovery path (script or admin route) — needed eventually but can ship right after if not ready day one, since risk is "I forgot my own password," not an active blocker
- [ ] Downloadable CSV import error report — only if on-screen preview proves insufficient in practice

### Future Consideration (v2+, already flagged Out of Scope in PROJECT.md)

- [ ] Exchange-native CSV import (Binance etc. formats) — different, larger feature
- [ ] Public/multi-user auth, hosted deployment with stricter session policy — only relevant once the app is actually hosted, not for this local-only milestone

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Dark mode toggle + persistence | MEDIUM | LOW | P1 |
| Auth (setup + login + logout + route guard) | HIGH (unblocks future hosting; protects financial data) | MEDIUM | P1 |
| CSV export | HIGH (data-loss insurance) | LOW | P1 |
| CSV import with validation + dedupe | HIGH (backup is worthless without restore) | MEDIUM | P1 |
| Long-lived session over bank-style short timeout | MEDIUM (UX, avoids friction) | LOW | P1 (decision, not extra build) |
| Password recovery path | LOW (only matters if it happens) | LOW | P2 |
| UTF-8 BOM on export | LOW | LOW | P2 |
| Downloadable import error report | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, cheap enough to bundle in if time allows
- P3: Nice to have, defer until it's actually a pain point

## Notes on Password Hashing (dependency for Auth)

Not a "feature" itself but a required implementation decision the roadmap/requirements should pin down:

- Current best-practice recommendation (2026, LOW confidence — websearch only) is **Argon2id** as the modern OWASP/NIST default over bcrypt, typically via a native binding (e.g. `@node-rs/argon2`) rather than pure-JS implementations.
- Given this project already accepts a native module (`better-sqlite3`), adding one more native module for Argon2id is a low-cost addition, not a new category of risk.
- **bcrypt (cost ≥ 12) remains "safe enough"** for a single-user, local-only, no-public-exposure app; the security delta between bcrypt and Argon2id is irrelevant at this threat model (no attacker has the hash to crack in the first place).
- Recommendation for roadmap: either is acceptable; pick Argon2id if the team wants to be future-proof for eventual hosting, pick bcrypt if minimizing new dependencies/build complexity is preferred this milestone. This is a LOW-stakes decision — do not over-invest research time here.

## Sources (v1.1 addendum)

- [LogRocket: Dark mode in React](https://blog.logrocket.com/dark-mode-react-in-depth-guide/) (websearch, LOW confidence)
- [PullRequest/HackerOne: Persisting Dark Mode with React](https://www.pullrequest.com/blog/create-a-persisting-dark-mode-with-react/) (websearch, LOW confidence)
- [Descope: Session Timeout Best Practices](https://www.descope.com/learn/post/session-timeout-best-practices) (websearch, LOW confidence)
- [Cyberbuddies: Fintech App Security — Inactivity Timeouts (ISO/PCI-DSS/NIST)](https://blog.cyberbuddiessolutions.com/%F0%9F%94%90-fintech-app-security-%F0%9F%95%92-best-practices-for-inactivity-timeouts-%E2%8F%B3-iso-pci-dss-nist-guidelines-%F0%9F%9A%80/) (websearch, LOW confidence)
- [PTKD: Fintech app session timeout and logout guide](https://ptkd.com/mobile-security/mobile-app-security/fintech-app-session-timeout-and-logout) (websearch, LOW confidence)
- [Koody: Personal finance app with CSV import and categorization](https://koody.com/blog/personal-finance-app-csv-import) (websearch, LOW confidence)
- [Econumo: Export to CSV guide](https://econumo.com/posts/export-to-csv/) (websearch, LOW confidence)
- [BankXLSX: Capital One transactions to CSV columns](https://bankxlsx.com/blog/can-i-export-capital-one-transactions-to-csv-or-excel) (websearch, LOW confidence)
- [FileFeed: How to Clean CSV Data — 10 Fixes for Failed Imports](https://www.filefeed.io/blog/how-to-clean-csv-data) (websearch, LOW confidence)
- [FileFeed: Data Validation Best Practices](https://www.filefeed.io/blog/data-validation-best-practices) (websearch, LOW confidence)
- [Dromo: Best Practices for Handling Large CSV Files](https://dromo.io/blog/best-practices-handling-large-csv-files) (websearch, LOW confidence)
- [mfyz: Designing Scalable CSV Importers](https://mfyz.com/designing-scalable-csv-importers-what-a-good-importer-should-do/) (websearch, LOW confidence)
- [CSVBox: CSV Upload UI — File Import UX Patterns](https://blog.csvbox.io/file-upload-patterns/) (websearch, LOW confidence)
- [Kestrel Tools: Argon2 vs bcrypt 2026](https://blog.kestreltools.com/en/blog/argon2-vs-scrypt-vs-bcrypt-password-hashing-2026/) (websearch, LOW confidence)
- [WorkOS: Picking a password hash — argon2, bcrypt, scrypt](https://workos.com/blog/picking-a-password-hash-argon2-bcrypt-scrypt) (websearch, LOW confidence)
- [PkgPulse: Argon2 vs bcrypt (2026)](https://www.pkgpulse.com/compare/argon2-vs-bcrypt) (websearch, LOW confidence)
- [Hono Cookie Helper docs](https://hono.dev/docs/helpers/cookie) (websearch, LOW confidence)
- Existing project schema/decisions: `.planning/PROJECT.md` (v1.0 shipped features, v1.1 milestone scope, Key Decisions table)

---
*Feature research for: Crypto Organizer*
*v1.0 researched: 2026-07-03 — v1.1 addendum researched: 2026-07-17*
