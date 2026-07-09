# Crypto Organizer

## What This Is

Um aplicativo web pessoal para organizar compras e vendas de criptomoedas espalhadas por diferentes exchanges. Funciona como uma "carteira de ações", mas para crypto: consolida as operações num só lugar, calcula quanto foi investido e o preço médio de cada moeda, e gera as informações necessárias para declarar no Imposto de Renda brasileiro. É de uso pessoal (um único usuário).

## Core Value

Saber o preço médio e o custo de aquisição de cada criptomoeda de forma correta (regras do IR brasileiro), consolidando operações que hoje estão espalhadas em várias exchanges.

## Requirements

### Validated

- [x] Registrar manualmente compras de crypto (data, moeda, quantidade, valor em BRL, exchange de origem) — Phase 1
- [x] Registrar manualmente vendas de crypto (data, moeda, quantidade, valor em BRL, exchange) — Phase 1
- [x] Calcular preço médio por moeda seguindo as regras brasileiras (venda não altera o preço médio) — Phase 1
- [x] Ao vender, reduzir a posição e o custo de aquisição total proporcionalmente, preservando o preço médio — Phase 1
- [x] Mostrar a posição atual (quantidade em carteira) por moeda — Phase 1
- [x] Identificar de qual exchange cada operação veio ("saber onde comprei") — Phase 1 (exchange tornou-se **opcional**, não obrigatório, por decisão explícita durante a verificação da Fase 1 — uma operação pode ficar sem exchange registrada)

### Active

- [ ] Calcular total investido no agregado (visão consolidada de portfólio) — Phase 2
- [ ] Buscar cotação atual das principais moedas (BTC, ETH...) e mostrar valor de mercado + lucro/prejuízo não realizado — Phase 2
- [ ] Gerar relatório para a ficha de Bens e Direitos: custo de aquisição por moeda para a declaração anual — Phase 3

### Out of Scope

- Integração via API com exchanges — v1 é entrada manual; integração é complexa e cada exchange é diferente
- Importação de CSV/planilha das exchanges — considerado, mas fora do v1 (pode voltar como evolução)
- Cálculo de ganho de capital / regra dos R$35k mensais / geração de DARF — foco do v1 é Bens e Direitos, não o ganho de capital mensal
- Suporte a altcoins menos conhecidas / tokens obscuros — v1 foca nas principais moedas com cotação confiável
- Multiusuário / cadastro público — uso pessoal, um único usuário
- App mobile nativo — web-first

## Context

- Usuário brasileiro que hoje mantém crypto em múltiplas exchanges e tem dificuldade de organizar isso manualmente.
- Motivação principal é a declaração de Imposto de Renda (Bens e Direitos), onde cada cripto acima do limite deve ser declarada pelo custo de aquisição em 31/12.
- Regra brasileira relevante: ao vender parte de uma posição, o preço médio (custo unitário) permanece o mesmo; o que muda é a quantidade e o custo de aquisição total, que caem proporcionalmente.
- Valores monetários em BRL.
- Necessidade de rastrear a origem (exchange) de cada operação.

## Constraints

- **Tech stack**: Web app — stack a definir na fase de pesquisa. Preferência por algo simples de rodar localmente.
- **Deploy**: Começar rodando local (PC/rede local do usuário), mantendo a porta aberta para hospedar online no futuro. Decisões não devem inviabilizar hospedagem posterior.
- **Segurança**: Dados financeiros pessoais. Local-first no v1 mantém a superfície de risco baixa; se for hospedar depois, exigirá login protegido.
- **Escopo de usuário**: Único usuário — evitar complexidade de multiusuário no v1.
- **Cotações**: Depende de uma API de cotações externa para as principais moedas; deve degradar bem se a API estiver indisponível (dados de custo/IR não dependem de cotação).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Entrada manual de operações no v1 | Integração via API/CSV com exchanges é complexa e cada exchange difere; manual entrega valor rápido | Confirmado — Phase 1 (modal de compra/venda) |
| Foco do IR em Bens e Direitos (não ganho de capital/DARF) | É a dor imediata do usuário na declaração anual; ganho de capital pode vir depois | — Pending (Phase 3) |
| Incluir cotação atual (custo + valor de mercado) | Usuário quer ver quanto vale hoje, além do custo para IR | — Pending (Phase 2) |
| Único usuário, local-first, aberto a hospedar depois | Uso pessoal; simplicidade agora sem fechar portas | Confirmado — Phase 1 (SQLite local, sem auth) |
| Escopo inicial nas principais moedas (BTC, ETH...) | Cotação confiável e menor complexidade; altcoins podem entrar depois | Confirmado — Phase 1 (lista semeada com CoinGecko ID, extensível) |
| Exchange de origem passa a ser opcional (não obrigatória) | Decisão do usuário durante a verificação da Fase 1: nem toda operação tem exchange conhecida no momento do registro | Confirmado — Phase 1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

## Current State

Phase 1 (Transaction Management + Position Engine) complete — 2026-07-09. Users can record buy/sell transactions via modal, see per-coin position (quantidade, preço médio, custo de aquisição) recalculated live from the full ledger on every insert/edit/delete, with chronological non-negative-position validation enforced on all mutation paths. Next: Phase 2 (Portfolio Dashboard + Market Prices).

---
*Last updated: 2026-07-09 after Phase 1 completion*
