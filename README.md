# Crypto Organizer

Aplicativo web pessoal para organizar compras e vendas de criptomoedas
espalhadas por diferentes exchanges. Consolida as operações num só lugar,
calcula o preço médio e o custo de aquisição de cada moeda seguindo as
regras do Imposto de Renda brasileiro.

## Stack

React 19 + Vite 6 + TypeScript 5, Hono 4 (`@hono/node-server`), SQLite via
`better-sqlite3` + Drizzle ORM, Decimal.js for all monetary/quantity math,
TanStack Query 5, Tailwind CSS v4. See `.claude/CLAUDE.md` for the full
locked stack and rationale.

## Getting started

```bash
npm install
cp .env.example .env   # optional: add a free CoinGecko Demo API key
npm run db:push        # create the SQLite schema
npm run seed            # seed default coins and exchanges
npm run dev              # starts Vite (5173) + Hono (3000) together
```

Open http://localhost:5173.

## Scripts

- `npm run dev` — Vite dev server + Hono API server (via `concurrently`)
- `npm run build` — type-check and build a production bundle
- `npm run test` / `npm run test:run` — Vitest (watch / single run)
- `npm run db:push` — apply the Drizzle schema to the local SQLite file
- `npm run db:reset` — delete `app.db` and recreate the schema from scratch
- `npm run seed` — idempotently seed default coins and exchanges

## Resetting the database

To wipe all local data and start from an empty schema:

```bash
npm run db:reset   # deletes app.db, then recreates the schema
npm run seed       # optional: re-seed default coins and exchanges
```

**Warning:** this permanently deletes every transaction in `app.db`. There is
no undo. Only the schema is recreated — run `npm run seed` afterwards if you
want the default coins and exchanges back.

The command uses `rm -f` and targets the default `app.db`. If you point
`DATABASE_PATH` at a different file, delete that file manually instead.

## Autenticação / Recuperação de acesso

O app tem um login usuário+senha de uso pessoal, com setup na primeira vez
que o servidor roda (sem tela de cadastro pública). Duas coisas a saber:

- **`SESSION_SECRET` é obrigatória.** É a chave que assina o cookie de
  sessão. Sem ela (ou vazia), o servidor **recusa iniciar** e imprime uma
  mensagem clara no console. Gere um valor e coloque no seu `.env` local
  (nunca commitado):

  ```bash
  openssl rand -hex 32
  ```

  Copie o resultado para `SESSION_SECRET=` no seu `.env` (`.env.example`
  já traz a entrada).

- **Esqueceu a senha?** Não existe fluxo de recuperação pela interface —
  é uso pessoal, então o reset é manual direto no banco SQLite: apague a
  linha da tabela `auth_credentials` (por exemplo, com `sqlite3 app.db
  "DELETE FROM auth_credentials;"`). No próximo acesso o app volta a
  mostrar a tela de configuração inicial, como se fosse a primeira vez.

## Notes

- Amounts and quantities are stored as `TEXT` in SQLite and parsed with
  Decimal.js everywhere — native JS `Number` is never used for money/crypto
  quantity arithmetic (see `src/lib/decimal.ts`).
- Positions (quantity, preço médio, custo de aquisição) are never persisted;
  they are always recomputed from the full transaction ledger
  (`src/engine/positionEngine.ts`).
