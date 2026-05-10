# Finanças App — Relatório de Progresso

**Última atualização:** 2026-05-09 (fim de session — refactor Postgres + Workspaces ~85% completo, aguardando connection string)

App pessoal de controle financeiro. Tecnologia: Next.js 15 + React 19 + Drizzle + **Postgres (Supabase)** + Tailwind v4 + shadcn-style + Anthropic SDK.

---

# ⚠️ AO RETOMAR ESSA SESSION, LEIA AQUI PRIMEIRO

## Estado do refactor em andamento (Fase V + W)

Você decidiu transformar o app de **single-user PF/PJ-consolidado (SQLite local)** em **multi-workspace por código (Postgres na Supabase + Vercel)**. Trabalho está **~85% feito**, aguardando **uma única ação manual sua** pra destravar.

### O que falta antes de testar

**Você precisa colar a connection string do Supabase no `.env.local`:**

1. Abrir https://supabase.com/dashboard/project/**rsyifdrjdeoxsiygrtul**/settings/database
2. Em **Connection pooling**, modo **Transaction**, copiar a string
3. Substituir `[YOUR-PASSWORD]` pela senha do banco (se esqueceu, "Reset database password" no mesmo lugar)
4. Colar em `financas-app/.env.local` como:
   ```
   DATABASE_URL=postgresql://postgres.rsyifdrjdeoxsiygrtul:SENHA@aws-0-XXX.pooler.supabase.com:6543/postgres
   ```
5. Reiniciar dev:
   ```bash
   pkill -f "next dev"
   cd financas-app
   npm run dev
   ```
6. Abrir `localhost:3000` → middleware redireciona pra `/entrar` → digita um dos códigos:
   - `eduardotdmcfxng` (tem 3 contas seed: Itaú PF, Cora PF, Amex Pessoal)
   - `e21studio` (vazio)
   - `victor` (vazio)

### Depois disso, retomar comigo

Diz pro Claude: **"DATABASE_URL configurada, vamos validar o refactor"**. Ele vai:
1. Smoke test de todas as rotas
2. Validar login → dashboard funciona
3. Possivelmente consertar bugs que aparecerem
4. Continuar pra **Fase D (Deploy Vercel)** ou criar **/config simples** (pra cadastrar contas em workspaces vazios)

---

## O que foi feito nesta session

### Migração SQLite → Postgres (Supabase)

- **Schema reescrito** em `src/db/schema.ts` usando `pgTable` no schema dedicado `financas`
- **Driver trocado**: `better-sqlite3` → `postgres` (postgres-js) + `drizzle-orm/postgres-js`
- **Conexão lazy** em `db/client.ts` — não joga em import se `DATABASE_URL` faltar (testes funcionam)
- **`drizzle.config.ts`** atualizado pra `postgresql` + `schemaFilter: ['financas']`
- **Schema aplicado no Supabase** via MCP `apply_migration` (9 tabelas + indexes + RLS habilitado sem policies — defesa em depth)

### Workspaces (substituindo PF/PJ/Consolidado)

- **Tabela `workspaces`** criada com `code` único (case-insensitive)
- **3 workspaces seedados** via SQL no Supabase:
  - `eduardotdmcfxng` (Pessoal Eduardo) — com 3 contas seed
  - `e21studio` (E21 Studio) — vazio
  - `victor` (Victor) — vazio
- **18 categorias por workspace** seedadas (12 expense + 6 income)
- **Coluna `ownership` removida** de accounts e categories (já não existe no Postgres)
- **Tipo `Ownership`** removido do código TypeScript

### Auth simples por código

- `src/lib/workspace.ts` — `getActiveWorkspace`, `requireActiveWorkspace`, `requireActiveWorkspaceId` (lê cookie HttpOnly)
- `src/lib/actions/workspace.ts` — `enterWorkspace(code)`, `leaveWorkspace()`
- `src/app/entrar/page.tsx` + `src/components/entrar-form.tsx` — tela de login
- `src/middleware.ts` — redireciona pra `/entrar` se sem cookie
- Cookie 30 dias, HttpOnly, SameSite=Lax, secure em prod

### Async refactor em todo o app

Todas as queries Drizzle (eram síncronas com `better-sqlite3`) viraram **async** com `await`:

- `lib/accounts.ts`, `lib/transactions.ts`, `lib/recurring.ts`, `lib/cards.ts`, `lib/projection.ts`, `lib/reserve.ts`, `lib/patrimony.ts`, `lib/import.ts` — todas as funções de leitura agora aceitam `workspaceId: string` como primeiro parâmetro
- `lib/actions/transactions.ts`, `lib/actions/recurring.ts`, `lib/actions/card-purchases.ts`, `lib/actions/imports.ts`, `lib/actions/patrimony.ts` — chamam `requireActiveWorkspaceId()` no início
- `lib/boot.ts` — `ensureRecurringGenerated(workspaceId)` com throttle por workspace
- Todas as `app/*/page.tsx` viraram `async` e chamam `requireActiveWorkspaceId()`

### Server Actions: workspace-scoped

- Inserts incluem `workspaceId` automaticamente
- Updates/deletes usam `WHERE workspace_id = ? AND id = ?` (defesa contra cross-workspace)
- `db.transaction(async (tx) => ...)` (sintaxe assíncrona do postgres-js)
- `result.changes` substituído por `.returning({...})` + `result.length`

### Testes

- **121/121 passam** (eram 124 — removidos 3 testes de ownership que não fazem mais sentido)
- Removidas referências a `ownership` em todos os fixtures
- `lib/db/client.ts` aceita ausência de `DATABASE_URL` em testes (postgres-js não conecta até primeira query)

### MCP do Supabase configurado

- MCP server adicionado: `claude mcp add --scope project --transport http supabase ...`
- Autenticado via OAuth
- Acesso a: `list_tables`, `apply_migration`, `execute_sql`, `get_project_url`, `get_logs`, etc.
- **Não expõe** credenciais sensíveis (database password, service_role) — por design

---

## Decisões importantes registradas

- **Workspace simples sem password** (Netflix-profile style). Eduardo aceitou trade-off: quem sabe o código entra. Se virar problema, troca por magic link Resend.
- **Schema dedicado `financas`** no Supabase (isolado de outras tabelas que possam existir no project).
- **Códigos case-insensitive** (transform `.toLowerCase()` no schema Zod).
- **Cookie 30 dias rolling, HttpOnly, single-device** (logout só nesse browser).
- **Connection pooling Transaction mode** + `prepare: false` (necessário com pgbouncer transaction).
- **RLS habilitado sem policies** — bloqueia acesso anônimo via REST API; service_role (server) bypassa.
- **Cada workspace tem suas próprias categorias e learnings** — sem cruzamento.
- **Migração destrutiva** dos dados antigos (SQLite local) — só seed novo no Supabase.
- **Bug retroativo da Etapa 4 (timezone)** já estava corrigido com `parseISO`.
- **`'use server'` files**: schemas Zod ficam const interno (Next 15 só permite export de async funcs).

---

## Pendências pós-DATABASE_URL

### Crítico (testar antes do deploy)

- [ ] Smoke test login → dashboard com workspace `eduardotdmcfxng`
- [ ] Smoke test em todas as 8 rotas (Dashboard, Lançamentos, Recorrências, Cartões, Patrimônio, Simulador, Config, Importar)
- [ ] Criar transaction, recorrência, compra parcelada — confirmar que persistem no Supabase
- [ ] Logout → redireciona pra /entrar
- [ ] Trocar de workspace → ver dados isolados

### UX importante

- [ ] **Header**: hoje ainda tem seletor PF/PJ/Consolidado. Precisa remover e mostrar workspace ativo + botão "Sair"
- [ ] **`/config`**: hoje placeholder. Precisa pelo menos: form de "Nova conta" pra workspaces vazios (e21studio, victor) conseguirem cadastrar contas
- [ ] **Sidebar**: pode adicionar nome do workspace ativo no header da sidebar

### Próximas fases

- [ ] **Fase D — Deploy Vercel**:
  - Conectar GitHub repo no Vercel
  - Env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`
  - Smoke test no domínio `*.vercel.app`
  - (Opcional) Domínio próprio
- [ ] **Polimento** original da spec Etapa 10:
  - Backup automático do Supabase (alternativa ao `scripts/backup.ts` que era do SQLite)
  - Light theme
  - Atalhos de teclado

---

## Estado do código

### Working tree

**Tudo commitado** ao final desta session — push pro `origin/main` feito (ver `git log`).

### Estrutura (mudanças desta session)

```
financas-app/src/
  db/
    client.ts                ← postgres-js (async)
    schema.ts                ← pgTable + workspaces + workspace_id em todas
    seed.ts                  ← APAGADO (era better-sqlite3; seed agora via MCP/SQL)
  lib/
    workspace.ts             ← NOVO (cookie helpers)
    actions/
      workspace.ts           ← NOVO (enter/leave)
      transactions.ts        ← async + workspace-scoped
      recurring.ts           ← idem
      card-purchases.ts      ← idem
      imports.ts             ← idem
      patrimony.ts           ← idem
    accounts.ts              ← async + workspaceId param
    boot.ts                  ← throttle por workspace
    cards.ts                 ← async + workspaceId
    transactions.ts          ← async + ILIKE
    recurring.ts             ← async + workspaceId
    projection.ts            ← async, sem ownership
    projection-compute.ts    ← sem ownership
    reserve.ts               ← async + workspaceId
    patrimony.ts             ← async + workspaceId
    patrimony-compute.ts     ← sem ownership
    import.ts                ← async + workspaceId
  middleware.ts              ← NOVO (redirect /entrar)
  app/
    entrar/page.tsx          ← NOVO (login)
    page.tsx                 ← async + requireActiveWorkspaceId
    lancamentos/page.tsx     ← idem
    recorrencias/page.tsx    ← idem
    cartoes/page.tsx         ← idem
    patrimonio/page.tsx      ← idem
    simulador/page.tsx       ← idem
    importar/page.tsx        ← idem
    config/page.tsx          ← ainda placeholder (TODO)
  components/
    entrar-form.tsx          ← NOVO
```

### Banco no Supabase (project `rsyifdrjdeoxsiygrtul`)

Schema `financas` com 9 tabelas:
- `workspaces` (3 rows: eduardotdmcfxng, e21studio, victor)
- `accounts` (3 rows: só workspace eduardo)
- `categories` (54 rows: 18 por workspace × 3)
- `transactions`, `recurring_rules`, `card_purchases`, `import_batches`, `assets_snapshots`, `category_learnings` (vazias)

### `.env.local`

- `ANTHROPIC_API_KEY` — preenchido (aplicação Claude/Sonnet/Haiku)
- `DATABASE_URL` — **VAZIO ou DESATUALIZADO** ← precisa preencher (ver topo)

### Comandos úteis

```bash
cd financas-app

# Dev (com unset ANTHROPIC_API_KEY pré-pendido pra evitar bug do shell):
npm run dev

# Testes:
npm test                # 121 testes
npm run typecheck       # tsc --noEmit

# Banco (precisa DATABASE_URL):
npm run db:push         # aplica schema.ts no Postgres
npm run db:generate     # gera migration SQL
npm run db:studio       # interface visual

# Importante: NÃO existe mais `npm run seed`. Seed foi feito via SQL no Supabase.
```

---

## Histórico anterior (Etapas 1-9 do core)

[Detalhes preservados abaixo. Tudo isso está em produção do código atual, só foi adaptado pra Postgres + Workspaces nesta session.]

### Etapa 1 — Setup ✓
TypeScript estrito, Tailwind v4, shadcn-style, Next.js 15 + App Router, design system com tokens semânticos, layout com sidebar fixa.

### Etapa 2 — CRUD de Lançamentos ✓
Server Actions com Zod safeParse, transferência atomic via `db.transaction`, URL como source of truth pra filtros, edit inline de categoria.

### Etapa 3 — Recorrências ✓
Job idempotente que materializa transactions futuras, filtragem por mês (não data exata), cascade no código.

### Etapa 4 — Cartões e parcelamento ✓
Distribuição exata de centavos (resto na última parcela), cycle de fatura com clamp pra fevereiro, validação em duas camadas (Zod + queries).

### Etapa 5 — Saldo projetado e dashboard ✓
`computeProjection` puro testado, gráfico Recharts com semáforo por ponto, banda da reserva mínima, alertas condicionais.

### Etapa 6 — Simulador ✓
Pessimismo no cartão (proxy de impacto), 2 gráficos lado a lado, verdict tricolor, redirect pós-confirmar. Bug retroativo de timezone consertado (parseISO).

### Etapa 7 — Importação CSV/OFX ✓
Parsers locais, hash SHA-256 pra dedup, detecção de parcelas via regex, aprendizado de categoria por reforço.

### Etapa 8 — Importação PDF + Anthropic + Markdown ✓
Cliente Anthropic com 3 camadas de defesa contra output bagunçado da LLM. Markdown como caminho preferido (custo zero via Claude Max).

### Etapa 9 — Patrimônio ✓
Snapshot mensal, computeAccountBalanceAt puro, gráfico de área de evolução, cards de checking/cartões/investments/líquido.

---

## Bugs descobertos durante todo o projeto (todos corrigidos)

| # | Etapa | Sintoma | Como pego |
|---|---|---|---|
| 1 | 1.4 | seed.ts misturava APIs do Drizzle | TypeScript strict |
| 2 | 3.1 | nextOccurrences perdia 1 ocorrência | Smoke test puro |
| 3 | 4.2 (achado em 6) | new Date(iso) shift de timezone | Vitest com jan/31 |
| 4 | 7.3 | Schemas Zod exportados em 'use server' | Webpack runtime |
| 5 | 7.4 | Hash de conteúdo como key React | Console browser |
| 6 | 8.x | env shell sobrescrevia .env.local | Debug endpoint |

## Padrões aprendidos

- Função pura separada de função que toca db (client-safe)
- `ActionResult<T>` compartilhado em `lib/actions/types.ts`
- Identidade React por índice/ULID, não por hash de conteúdo
- Validação em camadas (Zod + query + domínio)
- TDD-light em funções de cálculo
- `'use server'` files: só async funcs exportadas
- `parseISO` em vez de `new Date(string)` pra strings ISO
- Cookie HttpOnly + SameSite=Lax pra workspace ativo
- Conexão DB lazy (não conecta no import) pra testes funcionarem sem DATABASE_URL

---

**Quando voltar:** configure DATABASE_URL e me avise. Em ~10 minutos vamos ter app rodando contra Supabase. Em mais ~30 minutos, deploy Vercel.
