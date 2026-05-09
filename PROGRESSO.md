# Finanças App — Relatório de Progresso

**Última atualização:** 2026-05-09

App pessoal de controle financeiro, construído com Eduardo em pareamento didático seguindo a [spec.md](spec.md). Tecnologia: Next.js 15 + React 19 + Drizzle + SQLite + Tailwind v4 + shadcn-style.

---

## Estado atual

| | |
|---|---|
| Etapas concluídas | **1 → 4** (de 10) |
| Arquivos em `src/` | 44 |
| Typecheck | limpo |
| Rotas funcionais | 7 (todas HTTP 200) |
| Banco | 8 tabelas; 5 contas + 18 categorias seed |
| Dev server | `npm run dev` em `localhost:3000` |
| Bugs pegos no caminho | 2 (corrigidos; ambos via smoke test puro) |

**Funcionalidades vivas no app:**

- Cadastrar entrada/saída em conta corrente
- Cadastrar transferência atômica entre contas (gera 2 lançamentos)
- Filtrar lançamentos por busca/conta/categoria/tipo/data (estado na URL)
- Editar categoria inline na tabela
- Excluir lançamento com confirmação
- Cadastrar regra recorrente (aluguel, salário, assinaturas) — gera 12 lançamentos pendentes
- Toggle ativo/inativo de regra (apaga/regenera pendentes)
- Editar/excluir regra recorrente
- Cadastrar compra parcelada no cartão — gera N lançamentos pendentes com sufixo `(i/N)`
- Visualizar fatura aberta + cycle de fechamento por cartão
- Excluir compra parcelada (com guard contra parcelas confirmadas)

**Funcionalidades pendentes (Etapas 5-10):** dashboard com saldo projetado, simulador de compra, importação CSV/OFX, importação PDF + categorização Anthropic, snapshots de patrimônio, polimento (light theme, atalhos, backup automático).

---

## Etapas concluídas

### Etapa 1 — Setup (5 sub-blocos)

Toolchain, design system, banco, layout base.

**1.1 Toolchain** — `tsconfig.json` (strict), `next.config.ts`, `postcss.config.mjs`. `npm install` (185 pacotes).

**1.2 Tailwind v4 + design system** — `globals.css` com `@theme {}` definindo paleta da spec §9 (off-black quente, verde-floresta, rosé-tijolo, caramelo) e referências às fontes Fraunces/Geist.

**1.3 shadcn-style** — `components.json`, `src/lib/utils.ts` com `cn()`, componentes `Button` (6 variantes) e `Card` (com `CardValue` adicionado pra valores monetários).

**1.4 Banco** — `src/db/client.ts` (singleton SQLite com `foreign_keys=ON` e WAL), `data/financas.db` criado via `drizzle-kit push`, seed populado e tornado idempotente.

**1.5 Layout + dashboard placeholder** — `src/app/layout.tsx` (sidebar + header + `next/font` × 3), `src/app/page.tsx` (4 cards zerados + placeholder de gráfico), 6 esqueletos de página pras outras rotas.

**Bug pego:** `src/db/seed.ts` misturava sintaxes de API tradicional e relacional do Drizzle. Strict TS detectou antes do banco ser populado.

**Decisões registradas:**
- TypeScript estrito desde o dia 1
- Tailwind v4 com config-via-CSS (sem `tailwind.config.ts`)
- shadcn copy-paste (componentes vivem dentro do projeto)
- SQLite local-first (arquivo único em `data/financas.db`)
- App Router com pasta-vira-rota
- `serverActions.bodySizeLimit: '10mb'` antecipando upload de PDFs

---

### Etapa 2 — CRUD de Lançamentos (5 sub-blocos)

CRUD completo com filtros, edit inline, delete confirmado.

**2.1 Schemas Zod + queries** — `src/lib/transactions.ts` com `createTransactionSchema`, `updateTransactionSchema`, `TransactionRow` tipado, `listTransactions(filters)` com JOIN.

**2.2 Server Actions** — `src/lib/actions/transactions.ts` com `createTransaction`, `createTransfer` (atomic via `db.transaction`), `updateTransaction`, `deleteTransaction`. Tipo `ActionResult<T>` introduzido.

**2.3 Tela de listagem** — `src/components/ui/table.tsx`, `src/app/lancamentos/page.tsx` com tabela, sinal/cor por tipo (`+R$` verde, `−R$` rosé-tijolo), `tabular-nums` em valores.

**2.4 Modal de novo lançamento** — Componentes UI `dialog.tsx`, `input.tsx`, `label.tsx`, `select.tsx` (Radix); `src/components/new-transaction-dialog.tsx` com 3 modos (entrada/saída/transferência), `useTransition` pro estado pendente, `fieldErrors` por campo.

**2.5 Filtros + edit + delete** — Filtros via URL search params (`src/components/transaction-filters.tsx`); `category-cell.tsx` (Select inline com filtro por kind compatível); `delete-transaction-button.tsx` com confirmação modal.

**Decisões registradas:**
- Server Actions com `safeParse` (não `parse`) pra devolver `fieldErrors` estruturado
- `revalidatePath` envolto em try/catch (compatível com scripts/seeds)
- Transferência cria 2 transactions atomicamente (mesmo `transfer_id`)
- Delete de transferência apaga só um lado (consciente, decisão registrada)
- URL como source of truth pra filtros (shareable, persistente, browser back funciona)
- `.catch({})` no schema de filtros (URL inválida não derruba página)
- Debounce 300ms na busca, atualização imediata em selects
- Edit inline só em categoria, com filtragem de kind compatível

**Refatoração:** `ActionResult` movido pra `src/lib/actions/types.ts` pra ser compartilhável.

---

### Etapa 3 — Recorrências (4 sub-blocos)

CRUD de regras recorrentes + job idempotente que materializa transactions futuras.

**3.1 lib/recurring.ts** — Schemas Zod, queries, `nextOccurrences(rule, monthsAhead, now?)` (função pura com `now` injectable), `generateRecurringTransactions()` (job idempotente com filtragem por mês).

**3.2 Server Actions** — `src/lib/actions/recurring.ts` com `create/update/delete/toggle`. `db.transaction` no update/delete pra atomicidade entre regra + cascade nos pendentes.

**3.3 Tela /recorrencias** — `src/components/ui/switch.tsx` (sem Radix), `new-recurring-rule-dialog.tsx`, `recurring-rule-row-actions.tsx`. Linhas de regras inativas com `opacity-50`.

**3.4 Job no boot** — `src/lib/boot.ts` com `ensureRecurringGenerated()` (throttle 60s). `serverExternalPackages: ['better-sqlite3']` no `next.config.ts`. Disparado no início de Dashboard, Lançamentos e Recorrências pages.

**Bug pego:** `nextOccurrences` perdia uma ocorrência quando `startDate` caía depois do `dayOfMonth` no primeiro mês candidato. Conserto: condição dupla no loop (`for (i; i < maxIterations && dates.length < monthsAhead; i++)` + margem de 12 iterações extras). Pego pelo smoke test puro com 4/4 casos sintéticos.

**Decisões registradas:**
- **Idempotência via SELECT-then-INSERT** — pergunta antes de criar; segura pra single-process, single-user
- **Materialização** das transactions futuras (vs cálculo on-demand) — porque são editáveis individualmente
- **Filtragem por mês** (`like('YYYY-MM%')`) em vez de data exata — robustez contra edição manual da data dentro do mês
- **Cascade no código** (não no banco) pra ser seletivo: pending = projeção (re-derivável), confirmed = histórico (imutável)
- **Throttle module-level** (60s) — janela compartilhada entre requests, não por sessão
- **Falha silenciosa do job** com `console.error` — proporcional à criticidade (recurring não é crítico pro render)
- **`instrumentation.ts` abandonado** — bundler do Next 15 não consegue lidar com binding nativo de `better-sqlite3`. Page-level dispatch cobre o caso real.

**Refatoração:** ordering em `listRecurringRules` mudada pra `active DESC, dayOfMonth ASC` (inativas vão pro fim).

---

### Etapa 4 — Cartões e parcelamento (3 sub-blocos)

Compras parceladas com distribuição exata de centavos + cycle de fatura.

**4.1 lib/cards.ts** — `distributeInstallments` (resto na última parcela), `getCardCycle` (com clamp pra fevereiro), `listCreditCards`, `getOpenInvoiceTotal`, `listCardPurchases` (agregados por compra). 11/11 testes passaram em smoke test puro.

**4.2 Server Actions** — `src/lib/actions/card-purchases.ts` com `createCardPurchase` (insert atomic + N transactions) e `deleteCardPurchase` (com guard contra confirmadas). Validação em duas camadas: Zod (forma) + queries (domínio: conta é cartão, categoria é expense).

**4.3 Tela /cartoes** — `src/lib/installments.ts` (separação de função pura pra ser client-safe), `new-card-purchase-dialog.tsx` (com preview ao vivo via `useMemo`), `delete-card-purchase-button.tsx`, `src/app/cartoes/page.tsx` com seção por cartão.

**Decisões registradas:**
- **Distribuição de centavos:** `floor` na base, resto na última parcela (convenção brasileira)
- **`distributeInstallments` joga exceção** em input inválido (vs `null` em outras funções) — porque é "bug do programador", não "erro do usuário"
- **Comparação de data via string ISO** (`t.date > '2026-04-28'`) — funciona porque ISO 8601 é lexicograficamente ordenado
- **Cycle: closing exclusive na frente, inclusive no final** — convenção brasileira de cartão
- **`getOpenInvoiceTotal` degrada graciosamente** quando cartão sem `closingDay` — soma todas as despesas em vez de jogar
- **Validação em duas camadas** (Zod + query) — contra usuário malicioso bypassar UI
- **Description sufixada `(i/N)`** quando multi-parcela
- **`installments.max(60)`** como sanidade (5 anos)
- **Delete bloqueado se há confirmadas** — proteção de histórico
- **`installments.ts` separado de `cards.ts`** — função pura sem dep no banco, importável em Client Component

---

## Estrutura do código

```
financas-app/
├── data/financas.db          # SQLite local (76KB)
├── drizzle/                  # gerado pelo drizzle-kit
├── src/
│   ├── app/                  # rotas Next.js (App Router)
│   │   ├── cartoes/page.tsx
│   │   ├── config/page.tsx
│   │   ├── lancamentos/page.tsx
│   │   ├── patrimonio/page.tsx
│   │   ├── recorrencias/page.tsx
│   │   ├── simulador/page.tsx
│   │   ├── globals.css       # @theme com paleta + fontes
│   │   ├── layout.tsx        # sidebar + header + next/font × 3
│   │   └── page.tsx          # dashboard (placeholder)
│   ├── components/
│   │   ├── ui/               # shadcn copy-paste (button, card, dialog, input, label, select, switch, table)
│   │   ├── header.tsx        # server (mês + seletor PF/PJ estático)
│   │   ├── sidebar.tsx       # CLIENT (usePathname pra item ativo)
│   │   ├── category-cell.tsx
│   │   ├── delete-card-purchase-button.tsx
│   │   ├── delete-transaction-button.tsx
│   │   ├── new-card-purchase-dialog.tsx
│   │   ├── new-recurring-rule-dialog.tsx
│   │   ├── new-transaction-dialog.tsx
│   │   ├── recurring-rule-row-actions.tsx
│   │   └── transaction-filters.tsx
│   ├── db/
│   │   ├── client.ts         # singleton com WAL + foreign_keys=ON
│   │   ├── schema.ts         # 8 tabelas Drizzle
│   │   └── seed.ts           # popula 5 contas + 18 categorias (idempotente)
│   └── lib/
│       ├── actions/
│       │   ├── card-purchases.ts
│       │   ├── recurring.ts
│       │   ├── transactions.ts
│       │   └── types.ts      # ActionResult<T>
│       ├── accounts.ts       # listAccounts, listCategories
│       ├── boot.ts           # ensureRecurringGenerated com throttle
│       ├── cards.ts          # cycles + queries de fatura
│       ├── format.ts         # formatBRL, formatTxAmount, formatDateShort
│       ├── installments.ts   # função pura (client-safe)
│       ├── parse.ts          # parseBRL com round contra float drift
│       ├── prompts.ts        # templates Anthropic (uso na Etapa 8)
│       ├── recurring.ts      # nextOccurrences + job idempotente
│       ├── transactions.ts   # schemas + listTransactions
│       └── utils.ts          # cn() (clsx + tailwind-merge)
├── components.json           # config shadcn CLI
├── drizzle.config.ts
├── next.config.ts            # serverExternalPackages: ['better-sqlite3']
├── package.json
├── postcss.config.mjs        # plugin Tailwind v4
├── tsconfig.json             # strict + paths @/*
└── .env.local                # ANTHROPIC_API_KEY (vazio), DATABASE_URL
```

---

## Banco de dados — estado atual

| Tabela | Linhas |
|---|---:|
| `accounts` | 5 |
| `categories` | 18 |
| `transactions` | 0 |
| `recurring_rules` | 0 |
| `card_purchases` | 0 |
| `import_batches` | 0 |
| `assets_snapshots` | 0 |
| `category_learnings` | 0 |

**Contas seed:**
- Itaú PF (checking, PF)
- Cora PF (checking, PF)
- Amex Pessoal (credit_card, PF) — `closingDay`/`dueDay` nulos, ajustar em /config
- InfinitePay PJ (checking, PJ)
- XP Empresa (credit_card, PJ) — `closingDay`/`dueDay` nulos

**TODO operacional:** preencher `closingDay`/`dueDay` da Amex e XP Empresa pra que `/cartoes` calcule cycle. Fazer via SQL direto (até a tela `/config` existir):
```bash
sqlite3 data/financas.db "UPDATE accounts SET closing_day=28, due_day=10 WHERE name='Amex Pessoal';"
sqlite3 data/financas.db "UPDATE accounts SET closing_day=28, due_day=10 WHERE name='XP Empresa';"
```
(Ajuste os dias conforme seus cartões reais.)

---

## Próximas etapas (5–10)

Conforme spec §10.

| Etapa | Entrega principal | Conceitos novos esperados |
|---|---|---|
| **5** Saldo projetado e dashboard | `lib/projection.ts` (cálculo on-demand 12 meses), `lib/reserve.ts` (média móvel × pct), Dashboard com gráfico Recharts | Função pura de cálculo, gráfico, derivação vs materialização |
| **6** Simulador | `/simulador` com gráficos antes/depois, semáforo verde/amarelo/vermelho, "confirmar compra" → action | Reuso de `getProjectedBalance` com `hypothetical` |
| **7** Importação CSV/OFX | Parser local, dedup por hash, agrupamento de parcelas regex, preview review table | Sha256, parsers de CSV/OFX |
| **8** Importação PDF + categorização | `lib/anthropic.ts` (cliente), uso de `lib/prompts.ts`, `category_learnings` table com aprendizado | Anthropic SDK, document upload, batch categorization |
| **9** Patrimônio | `/patrimonio` com snapshots mensais, gráfico de evolução | Snapshot pattern (vs derived) |
| **10** Polimento | Backup automático (`scripts/backup.ts`), atalhos de teclado, light theme | — |

---

## Bugs descobertos durante a construção

1. **Etapa 1.4 — `seed.ts`**: misturava sintaxe da API tradicional do Drizzle (`db.select().from(...).where(eq(...))`) com a relacional (`db.query.X.findMany({ where: (t, {eq}) => ... })`). Pego pelo `npm run typecheck` graças ao strict TS antes do banco ser populado. Conserto: importar `eq` no topo, usar API tradicional consistentemente.

2. **Etapa 3.1 — `nextOccurrences`**: quando `startDate` caía depois do `dayOfMonth` no primeiro mês candidato (ex: dayOfMonth=10, startDate=15/ago), a primeira ocorrência era pulada e o usuário recebia 11 datas em vez das 12 pedidas. Pego pelo smoke test puro (caso "Start no futuro"). Conserto: condição dupla `for (i < maxIterations && dates.length < monthsAhead)` com margem de 12 iterações extras.

**Padrão observado:** ambos os bugs foram pegos por **testes leves de funções puras**, antes do banco ou da UI consumirem o código. Vale manter esse hábito nas próximas etapas — escrever um smoke test pra cada função de cálculo (`projection.ts`, `reserve.ts` na Etapa 5) antes de pluga-la.

---

## Comandos úteis

```bash
cd financas-app

# Desenvolvimento
npm run dev              # localhost:3000
npm run typecheck        # tsc --noEmit (chequee antes de commit)
npm run lint             # next lint

# Banco
npm run db:push          # aplica schema.ts no SQLite
npm run db:studio        # interface visual (drizzle-kit)
npm run seed             # popula contas + categorias (idempotente)

# Útil pra teste manual
sqlite3 data/financas.db "SELECT * FROM transactions LIMIT 10;"
sqlite3 data/financas.db "DELETE FROM transactions;"  # limpa pra testar
```

---

## Notas finais

**Ainda não há `git`** inicializado no projeto. Antes da Etapa 5 vale rodar `git init` + primeiro commit pra preservar o trabalho.

**Cobertura de teste:** 0 testes formais. Os smoke tests rodados foram descartáveis (apagados após uso). Não há suite de teste contínua. Conforme o app crescer, vale considerar adicionar Vitest pras funções puras (`projection.ts`, `reserve.ts`, `installments.ts`, `nextOccurrences`).

**Decisões pra revisitar quando virem incômodo:**
- Edit completo de transaction (hoje só dá pra editar categoria inline; valor/data exigem delete + recreate)
- Optimistic update na mudança de categoria (revalidation tem latência perceptível)
- Modal de "ver compras quitadas" no /cartoes (hoje somem da lista)
- Soft delete em vez de hard delete (se aparecer caso de "desfazer")

Pareamento didático seguido nas 4 etapas: cada bloco abriu com "o que vou fazer / por que / como conecta / o que aconteceria sem", conceitos novos foram explicados antes do uso, pausas explícitas no fim de cada sub-bloco.
