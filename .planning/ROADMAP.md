# Roadmap: Crypto Organizer

## Overview

Three phases that build from the correctness foundation outward. Phase 1 delivers the financial engine and full transaction CRUD — a working tool for tracking preço médio and custo de aquisição per Brazilian tax rules. Phase 2 adds market price enrichment and the portfolio summary dashboard, with live BRL and USD prices toggleable on market-data columns while IR/cost data stays permanently in BRL. Phase 3 delivers the primary use case: the Bens e Direitos tax report, ready to copy into the IRPF program.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Transaction Management + Position Engine** - Record buys/sells and see correct preço médio and custo de aquisição per Brazilian rules (completed 2026-07-09)
- [ ] **Phase 2: Portfolio Dashboard + Market Prices** - See total portfolio value, live BRL and USD prices with a BRL/USD toggle on market-data columns, unrealized gains, and graceful price-unavailable fallback
- [ ] **Phase 3: Bens e Direitos Tax Report** - Generate complete IR tax report with custo de aquisição per coin as of Dec 31, ready to paste into IRPF

## Phase Details

### Phase 1: Transaction Management + Position Engine

**Goal**: As a crypto investor tracking Brazilian taxes across several exchanges, I want to record my buy and sell transactions and instantly see the correct preço médio and custo de aquisição per coin, so that I have an accurate, consolidated cost basis computed to the Brazilian tax rules.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: TX-01, TX-02, TX-03, TX-04, TX-05, TX-06, TX-07, POS-01, POS-02, POS-03
**Success Criteria** (what must be TRUE):

  1. User can record a buy transaction with date, coin, quantity, BRL amount, fee (taxa), and exchange — and it appears in the transaction history
  2. User can record a sell transaction; the coin's quantity and custo de aquisição drop proportionally, while preço médio remains exactly unchanged (Brazilian rule)
  3. User can edit or delete any transaction and all positions (preço médio, custo de aquisição, quantity) recalculate immediately from the full ledger
  4. Per-coin position view displays quantity, preço médio, and custo de aquisição — a buy of 1 BTC for R$100,000 with R$500 fee shows custo de aquisição of R$100,500
  5. Transaction history is displayed in chronological order and shows the originating exchange for every entry

**Plans**: 1/1 plans complete
**Plan List**:

- [ ] 01-PLAN.md — Walking skeleton + pure position engine (tested) + buy/sell/edit/delete vertical slices + CRUD API + React UI (4 internal waves)

**UI hint**: yes

### Phase 2: Portfolio Dashboard + Market Prices

**Goal**: Users can see their total portfolio at a glance — total invested versus total market value versus unrealized P&L — with live prices from CoinGecko fetched in BRL and USD in a single call (vs_currencies=brl,usd), a toggle to switch the market-data display between BRL and USD, and graceful degradation when the price API is unavailable. Cost, preço médio, and Bens e Direitos data always remain in BRL per Brazilian tax law regardless of the toggle.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: POS-04, PRC-01, PRC-02, PRC-03, PRC-04, PRC-05, PRC-06
**Success Criteria** (what must be TRUE):

  1. Dashboard shows total invested (custo de aquisição in BRL), total market value, and total unrealized P&L aggregated across all coins
  2. Per-coin row shows quantity, custo de aquisição (BRL), current price, market value, and unrealized P&L — displayed in the currently active currency (BRL or USD) according to the toggle selection
  3. User can switch the market-data display between BRL and USD via a visible toggle; cost and custo de aquisição columns always remain in BRL regardless of toggle state
  4. When CoinGecko is unavailable or rate-limited, the custo de aquisição data remains fully visible and a "cotação indisponível" indicator appears in the price columns — the app does not crash
  5. Known coins (BTC, ETH, and the pre-defined list) resolve to their correct CoinGecko IDs automatically; no manual ID entry required

**Plans**: TBD
**UI hint**: yes

### Phase 3: Bens e Direitos Tax Report

**Goal**: Users can generate a complete Bens e Direitos declaration with custo de aquisição per coin as of Dec 31, filtered to the R$5,000 threshold, and copy a pre-formatted Discriminação text for each coin directly into the IRPF program.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: IR-01, IR-02, IR-03, IR-04
**Success Criteria** (what must be TRUE):

  1. Report shows custo de aquisição per coin as of Dec 31 of the selected year, derived exclusively from the transaction ledger — never from market prices
  2. Report automatically highlights (or filters to show only) coins with custo de aquisição >= R$5,000, the mandatory declaration threshold
  3. User can copy a pre-formatted Discriminação text for each coin — containing quantity, coin name, originating exchange, and exchange CNPJ — ready to paste into the IRPF software
  4. Exchange CNPJ cadastro lets the user configure known exchanges so their CNPJ appears correctly in every Discriminação entry

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Transaction Management + Position Engine | 1/1 | Complete   | 2026-07-09 |
| 2. Portfolio Dashboard + Market Prices | 0/? | Not started | - |
| 3. Bens e Direitos Tax Report | 0/? | Not started | - |
