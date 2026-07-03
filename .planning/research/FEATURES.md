# Feature Research

**Domain:** Personal crypto portfolio tracker — Brazil tax / Bens e Direitos focus
**Researched:** 2026-07-03
**Confidence:** MEDIUM (Brazilian tax rules cross-checked against multiple Brazilian sources; tracker feature set from market analysis of Koinly, CoinTracker, CoinStats, CoinTracking)

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

## Feature Landscape

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
| Multi-user / authentication | "My spouse also wants to use it" | Changes the security model entirely; session management, multi-tenancy in data model; contradicts local-first design | Single-user; if sharing is needed later, add a login layer as a separate milestone |
| Altcoin / token discovery / search across all coins | "I hold a new DeFi token" | Unreliable price feeds for obscure tokens; high maintenance; scope creep | Restrict to coins with reliable CoinGecko coverage; user manually enters coin ID if needed |
| Mobile native app | "I want to enter trades from my phone" | Two separate codebases; v1 is web-first local | Responsive web design is sufficient; a PWA could be a v1.x enhancement |
| NFT tracking | "I have NFTs too" | NFTs have no reliable price feed; unique valuation; completely different data model | Explicitly out of scope; focus on fungible crypto assets |
| Staking / yield / rewards tracking | "I earn yield on my holdings" | Staking income has different tax treatment; complex to model; each protocol differs | Not in scope v1; treat staking rewards as separate buy transactions if user wants to record them manually |

---

## Feature Dependencies

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

## MVP Definition

### Launch With (v1)

Minimum viable product — what is needed to replace the user's current spreadsheet.

- [ ] Buy transaction entry (date, coin, qty, total BRL paid, fees, exchange) — the primary input
- [ ] Sell transaction entry (date, coin, qty, total BRL received, fees, exchange) — with proportional cost reduction
- [ ] Transaction history list with edit and delete
- [ ] Per-coin position view: quantity held, total acquisition cost (custo de aquisição), preço médio
- [ ] Correct preço médio calculation following Brazilian rules (fees included, unit cost unchanged on sell)
- [ ] Current price fetch via CoinGecko (on demand; degrade gracefully if unavailable)
- [ ] Market value and unrealized P&L per coin
- [ ] Bens e Direitos report: acquisition cost per coin as of Dec 31 (user selects year), with R$5k threshold flag
- [ ] Exchange / source tag per transaction

### Add After Validation (v1.x)

Features to add once core is working and user trusts the cost calculations.

- [ ] Discriminação text auto-generator — useful once Bens e Direitos report is trusted
- [ ] Portfolio summary dashboard (total invested vs total value) — nice aggregate view
- [ ] R$5k threshold indicator on holdings screen — clarity on what needs declaring
- [ ] Month-by-month transaction grouping — helps auditing and memory

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] CSV import from exchanges — significant effort; validate manual entry first
- [ ] Capital gains / R$35k monthly tracking — different problem; own milestone
- [ ] Multi-user / login / hosted deployment — major architecture change
- [ ] DARF generation — requires capital gains first

---

## Feature Prioritization Matrix

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

## Competitor Feature Analysis

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

## Sources

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
*Feature research for: personal crypto portfolio tracker (Brazil IR / Bens e Direitos)*
*Researched: 2026-07-03*
