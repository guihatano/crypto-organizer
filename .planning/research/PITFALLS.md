# Pitfalls Research

**Domain:** Personal crypto portfolio tracker with Brazilian income-tax (Bens e Direitos) reporting
**Researched:** 2026-07-03
**Confidence:** MEDIUM (web sources cross-checked against official Receita Federal guidance and CoinGecko docs)

---

## Critical Pitfalls

### Pitfall 1: Using JavaScript's Native `number` Type for BRL Amounts

**What goes wrong:**
JavaScript's `number` is IEEE 754 double-precision float. Sums like `0.1 + 0.2` produce `0.30000000000000004`. When applied to BRL values — cost basis, average price, total invested — rounding errors accumulate silently across dozens of transactions, producing wrong totals in both the portfolio view and the Bens e Direitos report.

**Why it happens:**
Developers treat monetary values like any other number. The bug is invisible for small values; it surfaces only when totals are compared across reports or when a user spots that their declared custo de aquisição is R$0.03 off from what they paid.

**How to avoid:**
Use **Decimal.js** for all monetary arithmetic. Instantiate from string literals, never from JS number literals:
```typescript
// Wrong
const avg = (total + newAmount) / (qty + newQty);

// Right
const avg = new Decimal(total).plus(newAmount)
             .div(new Decimal(qty).plus(newQty));
```
Store BRL values in the database as `TEXT` (decimal string) or as integer centavos (multiply by 100, store as `INTEGER`). Never store as `REAL`/`FLOAT` in SQLite for money.

**Warning signs:**
- Unit tests for average-cost with repeating decimals (e.g., 3 equal purchases) produce off-by-one-centavo results
- Sum of individual line costs does not equal the stored total
- Portfolio "total invested" differs from sum of all buy amounts

**Phase to address:** Core data model and business-logic phase (first phase that touches transaction recording and average-cost calculation)

---

### Pitfall 2: Recalculating Preço Médio After a Sell

**What goes wrong:**
When a user sells part of a position, the code recalculates the preço médio (unit average cost) using only the remaining quantity or applies FIFO/LIFO logic. Under Brazilian rules, **selling does not change preço médio**. Only the total custo de aquisição and quantity change — proportionally. If preço médio is recalculated on sell, every subsequent average-cost figure is wrong, and the Bens e Direitos custo de aquisição will be incorrect.

**Why it happens:**
Developers apply intuitive bookkeeping (recalculate the average after removing units) or copy US tax-logic (FIFO/LIFO), neither of which matches the Brazilian rule.

**How to avoid:**
The invariant is:
```
preço_médio = custo_total / quantidade  (only changes on BUY)

On SELL of N units:
  custo_removido   = N × preço_médio
  custo_total_novo = custo_total - custo_removido
  quantidade_nova  = quantidade - N
  preço_médio      = UNCHANGED (custo_total_novo / quantidade_nova == old preço_médio)
```
Encode this as a named domain function (`calcSell`) with unit tests covering:
- Partial sell preserves preço médio
- Full sell zeroes out position
- Multiple buys then partial sell still preserves original preço médio

**Warning signs:**
- After a sell, the displayed preço médio changes
- Sum of (current_qty × preço_médio) does not equal custo_total
- Regression: a round-trip buy→sell→buy produces a different preço médio than expected

**Phase to address:** Core business-logic phase (average-cost engine). Flag for tax-rule verification before shipping the sell feature.

---

### Pitfall 3: Declaring Market Value Instead of Custo de Aquisição in Bens e Direitos

**What goes wrong:**
The Bens e Direitos report shows market value (valor de mercado) instead of acquisition cost. The user then declares the wrong number on their IR, which is incorrect — Receita Federal requires the custo de aquisição in BRL at time of purchase, not current market value.

**Why it happens:**
The app already fetches current prices to show unrealized P&L, and a developer pipes that same value into the tax report. The "Situação em 31/12" field in Bens e Direitos looks like it wants the balance at year-end, which developers confuse with market value.

**How to avoid:**
The Bens e Direitos report must source its figures exclusively from the ledger's custo de aquisição column, never from the price API. The two data flows must be physically separated in code:
- **Tax report flow:** ledger → custo de aquisição (BRL paid, not market)
- **Portfolio view flow:** ledger + price API → market value + unrealized P&L

Display a clear label in the report UI: "Custo de aquisição em 31/12/AAAA (não é o valor de mercado)".

**Warning signs:**
- Tax report figures change when the user refreshes price data
- The "situação em 31/12" value matches the "valor de mercado" column in the portfolio view
- No unit test verifies that tax output is independent of current price

**Phase to address:** Tax reporting phase (Bens e Direitos report generation). Also needs a UI label to prevent user confusion.

---

### Pitfall 4: Misapplying the R$5.000 Threshold (Per Asset, Not Per Portfolio)

**What goes wrong:**
The app either declares all crypto regardless of amount (unnecessary) or checks whether the total portfolio exceeds R$5.000 and skips declaration if it does not. The actual rule is per tipo de ativo: each coin/asset type is evaluated independently. A user with R$6.000 in BTC and R$2.000 in ETH must declare BTC but not ETH.

**Why it happens:**
The rule reads "criptoativos com custo de aquisição igual ou superior a R$5.000" and developers interpret "criptoativos" as the aggregate, not each individual asset.

**How to avoid:**
Filter per-asset in the tax report generation:
```typescript
const reportLines = positions
  .filter(p => p.custoAquisicaoTotal.gte(new Decimal('5000')))
  .map(p => buildBensDireitosLine(p));
```
Show the user all positions but visually distinguish which ones cross the threshold and will appear in the report. Positions below R$5.000 should appear with a note "abaixo do limite de declaração".

**Warning signs:**
- Single threshold check on portfolio total instead of per-coin check
- No test for the boundary case (exactly R$5.000 must be included; R$4.999,99 must not)
- Report includes or excludes all coins together

**Phase to address:** Tax reporting phase.

---

### Pitfall 5: Excluding Fees from Cost Basis

**What goes wrong:**
Brokerage/exchange fees paid when buying crypto (trading fee, network fee) are not added to the custo de aquisição. The stored cost basis is lower than the user actually paid, producing understated custo total and a wrong preço médio.

**Why it happens:**
The buy form only asks for "quantidade" and "valor pago em BRL" without a fees field, or the fee is captured separately but not added to the cost basis in the calculation.

**How to avoid:**
The buy transaction form must capture `valor_bruto` and `taxa` (fee). The cost basis is:
```
custo_de_aquisicao = valor_bruto + taxa
preço_médio = (custo_total_anterior + custo_de_aquisicao) / (qtd_anterior + qtd_nova)
```
For v1 (manual entry), prompt users to include fees in the "valor pago" field or add an explicit fee field with a tooltip explaining it increases cost basis.

**Warning signs:**
- Buy form has no fee field and no instruction to include fees in the amount
- Test case: buy 1 BTC for R$100,000 with R$500 fee — custo total should be R$100,500, not R$100,000
- Calculated total invested is always less than user's bank statement shows

**Phase to address:** Transaction recording phase (buy form + cost-basis engine).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store BRL as SQLite REAL | No library needed, easy ORM mapping | Silent precision loss accumulates into wrong totals and wrong tax declaration | Never for monetary amounts |
| Use JS `number` for all math | Simpler code, no Decimal.js dependency | Rounding errors surface as wrong Bens e Direitos figures — a user can file a wrong IR | Never for BRL amounts |
| Allow UPDATE/DELETE on transactions | Easier UI for corrections | Destroys audit trail; impossible to reconstruct position history or diagnose wrong totals | Never; use correction entries instead |
| Hardcode `vs_currency=brl` without fallback | Works 99% of the time | API downtime makes entire app appear broken, even though cost/IR data does not need price data | Acceptable to skip fallback in v1 if price section degrades gracefully |
| Single `positions` table computed at query time | No derived-state sync bugs | Re-computing on every load is fine for one user; not a problem at this scale | Acceptable for v1 single-user |
| Skip WAL mode in SQLite | Simpler config | Multi-step writes (buy + update position) can leave DB inconsistent on crash | Never; WAL is a one-line pragma |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CoinGecko price API | Use ticker symbol (e.g., `BTC`) as the coin identifier | Use CoinGecko's internal `id` field (e.g., `bitcoin`, `ethereum`). Multiple coins share the same symbol. Fetch the `/coins/list` endpoint to build a symbol→id map. |
| CoinGecko price API | Treat `null` price as `0` in P&L calculation | `null` means data unavailable (low-volume coin, delisted). Show "preço indisponível" and skip the market-value calculation for that row. |
| CoinGecko price API | Fetch one coin per request in a loop | Batch up to 250 coins in a single `/coins/markets?ids=bitcoin,ethereum,...&vs_currency=brl` call. The free Demo plan allows 30 req/min; a loop of 10 coins hits the limit immediately. |
| CoinGecko price API | Assume BRL (`vs_currency=brl`) is always available | BRL is a supported vs_currency in CoinGecko, but some obscure tokens may have no BRL trading pair, returning null. Always validate the response before using it. |
| CoinGecko price API | Block the UI on price fetch failure | Cost basis and IR data must be available offline. Fetch prices asynchronously; show the portfolio with cost data while prices load. Cache last-known prices with a timestamp. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-computing average cost across all transactions on every page load | Slow load as transaction history grows | Maintain a running `positions` table updated on each write (materialized state); never replay the full ledger on every render | Beyond ~500 transactions (near-instant for one user) |
| Fetching individual coin prices in a loop (N+1 API calls) | Rate-limit 429 errors from CoinGecko on portfolios with >5 coins | Batch all coin IDs in a single `/coins/markets` request | 5–10 coins on free tier |
| Loading entire transaction history into the browser for rendering | Memory and render lag for large ledgers | Paginate or virtualize the transaction list | Beyond ~1,000 transactions |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing the SQLite file in the web server's public directory | Anyone who can reach the server can download the entire financial ledger | Store the DB file outside the web root (e.g., `data/` not `public/`); serve only through the API layer |
| No authentication even for local-only deployment | If the user exposes the local port on the network or opens to internet later, all financial data is exposed | Add HTTP basic auth or session token at the server layer from day one, even locally; trivial to add, painful to retrofit |
| Logging request bodies containing BRL amounts / transaction details | Financial data ends up in log files with insecure permissions | Sanitize logs; never log full transaction payloads |
| Caching CoinGecko API keys in client-side code | API key exposed in browser source | Make all external API calls from the backend (Node server); never from the browser |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Tax report shows current market value labeled as "custo de aquisição" | User declares wrong value on IR, triggering Receita Federal inconsistency notice | Clearly label report values as "custo de aquisição (valor pago)" and add a note "não é o valor de mercado" |
| Report groups all cryptos in a single line | User cannot fill in separate Grupo 08 sub-codes (01=BTC, 02=Altcoin, 03=Stablecoin) | Generate one report line per moeda/tipo with the correct Grupo 08 code |
| Preço médio shown with many decimal places | User confused when comparing to broker statements (usually 2 decimal places) | Display preço médio rounded to 2 decimal places for BRL display; store full precision internally |
| No indication of which coins are below the R$5.000 threshold | User manually checks each coin; may accidentally include or exclude the wrong ones | Mark each position clearly: "declarar" (≥ R$5.000) vs "abaixo do limite" (< R$5.000) |
| Price data required before any data loads | If CoinGecko is down, user cannot see their portfolio at all | Load cost/position data immediately; show prices as a progressive enhancement with a loading state |

---

## "Looks Done But Isn't" Checklist

- [ ] **Average-cost engine:** Verify that after a partial sell, preço médio is numerically identical (not approximately equal) to the pre-sell preço médio — check with a Decimal equality assertion, not `===` on floats
- [ ] **Tax report:** Verify that the custo de aquisição figures in the Bens e Direitos report do NOT change when you refresh current prices — the report must be price-independent
- [ ] **R$5.000 filter:** Verify that a position of exactly R$5.000 is included, and R$4.999,99 is excluded — test the boundary explicitly
- [ ] **Fees in cost basis:** Verify that a buy of R$10.000 with R$50 fee produces a custo total of R$10.050 and a preço médio based on R$10.050, not R$10.000
- [ ] **Dec 31 snapshot:** Verify that the report queries positions as of end-of-day December 31 in Brasília time (UTC-3), not UTC — a transaction at 23:30 BRT should appear in the Dec 31 snapshot
- [ ] **CoinGecko null price:** Verify that a null price from the API shows "preço indisponível" and does not crash the portfolio view or set market value to R$0
- [ ] **SQLite WAL + transactions:** Verify that a simulated crash mid-write leaves the DB consistent (test by killing the process during a buy write)
- [ ] **Decimal storage:** Verify that BRL amounts are stored as TEXT or INTEGER centavos in SQLite — confirm with `PRAGMA table_info(transactions)` that no monetary column is REAL

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Float precision in stored data (REAL columns) | HIGH | Requires a data migration: read all rows, convert to Decimal, re-store as TEXT; validate totals match before and after |
| Wrong preço médio after sells (wrong calculation logic) | HIGH | Must recalculate entire position history from raw transactions in chronological order using correct logic; requires a "replay" migration |
| Declared wrong value on IR (market value instead of custo) | MEDIUM | User must file a declaração retificadora (corrective IR filing) for the affected year |
| CoinGecko coin ID mapping wrong (wrong symbol used) | LOW | Update the symbol→ID map; refresh prices on next load |
| Missing fees in past transactions | MEDIUM | Allow users to edit fee field on historical transactions, then trigger a position recalculation |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Float arithmetic (using JS number) | Phase 1: Data model + business logic | Unit test: sum 3 purchases of R$333,33 each → total must be exactly R$999,99 |
| Wrong preço médio on sell | Phase 1: Business logic (average-cost engine) | Unit test: buy 2×, sell partial, assert preço médio unchanged |
| Bens e Direitos at market value | Phase 2: Tax report generation | Integration test: change mock price, assert report output unchanged |
| R$5.000 threshold per asset | Phase 2: Tax report generation | Unit test: portfolio with one coin ≥ R$5.000 and one < R$5.000; only first in report |
| Fees excluded from cost basis | Phase 1: Transaction recording + business logic | Unit test: buy with fee → custo includes fee |
| Timezone/Dec 31 snapshot | Phase 2: Tax report generation | Unit test: transaction at 23:50 BRT Dec 31 appears in snapshot; at 00:10 BRT Jan 1 does not |
| CoinGecko wrong coin ID | Phase 3: Price integration | Smoke test: fetch BTC and ETH prices → non-null BRL values returned |
| CoinGecko null vs zero confusion | Phase 3: Price integration | Unit test: mock API returns null price → UI shows "indisponível", not R$0 |
| Mutable ledger destroying audit trail | Phase 1: Data model | Architectural decision: no DELETE/UPDATE on transactions table enforced by DB trigger |
| SQLite without WAL / no transactions | Phase 1: Data model setup | Smoke test: kill process mid-write; DB reopens without corruption |
| Missing Grupo 08 sub-codes in report | Phase 2: Tax report | Acceptance test: report for BTC uses code 01, ETH uses code 02 |

---

## Sources

- [CoinGecko API Troubleshooting Guide](https://www.coingecko.com/learn/coingecko-api-troubleshooting-guide-and-solutions) — rate limits, null values, wrong coin IDs (LOW confidence, web)
- [Infomoney: Como declarar Bitcoin e outras criptomoedas no IR 2026](https://www.infomoney.com.br/guias/bitcoin-criptomoedas-imposto-de-renda-ir/) — Grupo 08 codes, custo de aquisição rule (LOW confidence, web)
- [BlockTrends: Declaração IRPF 2026 criptomoedas](https://blocktrends.com.br/como-declarar-criptomoedas-imposto-renda-2026/) — R$5.000 per-asset threshold, preço médio rule (LOW confidence, web)
- [Koinly: Calculate Crypto Cost Basis](https://koinly.io/blog/calculate-cost-basis-crypto-bitcoin/) — fee treatment in cost basis, average cost after partial sell (LOW confidence, web)
- [Robin Wieruch: JavaScript Rounding Errors in Financial Applications](https://www.robinwieruch.de/javascript-rounding-errors/) — IEEE 754 pitfalls, Decimal.js solution (LOW confidence, web)
- [SQLite Forum: Corruption Prevention](https://www.sqliteforum.com/p/data-security-and-backup-strategies-in-sqlite-ensuring-data-integrity-and-protection) — WAL mode, transaction wrapping (LOW confidence, web)
- [MoldStud: Common SQLite Mistakes in Financial App Development](https://moldstud.com/articles/p-common-sqlite-mistakes-in-financial-app-development-and-how-to-avoid-them) — financial data integrity patterns (LOW confidence, web)
- [Lago Blog: Time Zones in Billing](https://getlago.com/blog/time-zone-nightmares) — UTC vs local time bugs in financial reporting (LOW confidence, web)
- Instrução Normativa RFB 1.888/2019 — foundational rule for crypto reporting obligations in Brazil (authoritative, cross-verified)

---
*Pitfalls research for: crypto portfolio tracker + Brazilian IR (Bens e Direitos)*
*Researched: 2026-07-03*
