# Finanças App — Relatório de Progresso

**Última atualização:** 2026-05-09 (Etapa 9 concluída — fim do core)

App pessoal de controle financeiro, construído com Eduardo em pareamento didático seguindo a [spec.md](spec.md). Tecnologia: Next.js 15 + React 19 + Drizzle + SQLite + Tailwind v4 + shadcn-style + Anthropic SDK.

---

## Estado atual

| | |
|---|---|
| **Etapas concluídas** | **1 → 9** (de 10) |
| Arquivos em `src/` | 77 |
| Arquivos de teste | 11 |
| **Testes** (Vitest) | **124 passando** |
| Typecheck | limpo |
| Rotas funcionais | 8 (todas HTTP 200) |
| Banco | 8 tabelas; 5 contas + 18 categorias seed |
| Dev server | `npm run dev` em `localhost:3000` |
| **Bugs pegos no caminho** | **6** (todos corrigidos; 4 retroativos achados por testes/uso) |
| Git | inicializado, branch `main`, remoto github.com/edu4rdov-e21/finances |

**Funcionalidades vivas no app (core completo):**

- Cadastrar entrada/saída/transferência (atomic 2-leg) entre contas
- Filtrar lançamentos por busca/conta/categoria/tipo/data (estado na URL — bookmarkable)
- Editar categoria inline, deletar com confirmação
- Cadastrar regra recorrente (aluguel, salário, assinaturas) — gera 12 lançamentos pendentes idempotentemente
- Cadastrar compra parcelada com distribuição exata de centavos (resto na última)
- Visualizar fatura aberta + cycle de fechamento por cartão
- **Dashboard** com saldo atual, lucro do mês, reserva mínima, fatura aberta + gráfico Recharts de 12 meses + lista de próximos lançamentos
- **Simulador**: inputs de compra, gráficos antes/depois lado a lado, veredicto colorido (verde/amarelo/vermelho), confirmar compra cria transactions reais
- **Importar** CSV (parser local), OFX (parser local), Markdown (parser local) e PDF (via Anthropic Sonnet, caro)
- **Categorização automática** via learnings locais (substring) → fallback Haiku se não casa
- Aprendizado de categoria por reforço (`category_learnings` com weight)
- **Patrimônio**: cards de contas/cartões/investimentos/líquido + form de snapshot mensal + gráfico de evolução 12 meses + tabela histórica

**Funcionalidades pendentes:** ver "Fase 2 — Polimento e refinamento" no fim deste documento.

---

## Etapas concluídas

### Etapa 1 — Setup (5 sub-blocos)

Toolchain, design system, banco, layout base.

**Decisões registradas:**
- TypeScript estrito desde o dia 1
- Tailwind v4 com config-via-CSS (sem `tailwind.config.ts`)
- shadcn copy-paste (componentes vivem dentro do projeto)
- SQLite local-first (arquivo único em `data/financas.db`)
- App Router com pasta-vira-rota
- `serverActions.bodySizeLimit: '10mb'` antecipando upload de PDFs

**Bug pego:** `src/db/seed.ts` misturava sintaxes de API tradicional e relacional do Drizzle. Strict TS detectou antes do banco ser populado.

---

### Etapa 2 — CRUD de Lançamentos (5 sub-blocos)

CRUD completo com filtros, edit inline, delete confirmado.

**Decisões registradas:**
- Server Actions com `safeParse` (não `parse`) pra devolver `fieldErrors` estruturado
- `revalidatePath` envolto em try/catch (compatível com scripts/seeds)
- Transferência cria 2 transactions atomicamente (mesmo `transfer_id`)
- URL como source of truth pra filtros (shareable, persistente, browser back funciona)
- `.catch({})` no schema de filtros (URL inválida não derruba página)
- Debounce 300ms na busca, atualização imediata em selects
- Edit inline só em categoria, com filtragem de kind compatível
- `ActionResult<T>` movido pra `src/lib/actions/types.ts` (compartilhável)

---

### Etapa 3 — Recorrências (4 sub-blocos)

CRUD de regras + job idempotente que materializa transactions futuras.

**Decisões registradas:**
- **Idempotência via SELECT-then-INSERT** — pergunta antes de criar
- **Materialização** das transactions futuras (vs cálculo on-demand) — porque são editáveis individualmente
- **Filtragem por mês** (`like('YYYY-MM%')`) em vez de data exata — robustez contra edição manual
- **Cascade no código** (não no banco) pra ser seletivo: pending = projeção (re-derivável), confirmed = histórico (imutável)
- **Throttle module-level** (60s) — janela compartilhada entre requests
- **Falha silenciosa do job** com `console.error` — proporcional à criticidade
- **`instrumentation.ts` abandonado** — bundler do Next 15 não consegue lidar com binding nativo de `better-sqlite3`. Page-level dispatch cobre o caso real.

**Bug pego:** `nextOccurrences` perdia uma ocorrência quando `startDate` caía depois do `dayOfMonth` no primeiro mês candidato. Conserto: condição dupla no loop. Pego pelo smoke test puro.

---

### Etapa 4 — Cartões e parcelamento (3 sub-blocos)

Compras parceladas com distribuição exata de centavos + cycle de fatura.

**Decisões registradas:**
- **Distribuição de centavos:** `floor` na base, resto na última parcela (convenção brasileira)
- **`distributeInstallments` joga exceção** em input inválido (vs `null`) — bug do programador, não erro do usuário
- **Comparação de data via string ISO** funciona porque ISO 8601 é lexicograficamente ordenado
- **Cycle: closing exclusive na frente, inclusive no final** — convenção brasileira de cartão
- **Validação em duas camadas** (Zod + query) — contra usuário malicioso bypassar UI
- **Description sufixada `(i/N)`** quando multi-parcela
- **Delete bloqueado se há parcelas confirmed** — proteção de histórico
- **`installments.ts` separado de `cards.ts`** — função pura sem dep no banco, importável em Client Component (padrão emergente)

**Bug retroativo descoberto na Etapa 6:** `new Date(stringIso)` em `card-purchases.ts` deslocava parcelas em 1 dia em fuso BR. Conserto: `parseISO`. Sem o teste do simulador (que usou jan/31 como input), esse bug ficaria latente meses até alguém parcelar dia 31.

---

### Etapa 5 — Saldo projetado e dashboard (4 sub-blocos)

Setup do Vitest + 3 funções puras de cálculo + Dashboard real com gráfico.

**Decisões registradas:**
- Saldo = só `checking` accounts; cartões fora
- Histórico (reserva) usa só confirmed; projeção usa confirmed + pending (pessimista)
- "Lucro do mês" = soma signed do mês corrente inteiro
- Hypothetical injetável só afeta accounts checking
- **Função pura separada de função que toca db** — `computeProjection` (puro) vs `getProjectedBalance` (toca banco). Padrão repetido em `installments.ts` e `patrimony-compute.ts`.
- Gráfico Recharts com **dot colorido por veredicto** (verde/caramelo/vermelho)
- Banda horizontal com reserva mínima como referência
- Threshold de confidence 0.6 pra categorização

**Setup Vitest:** stub pra `'server-only'`, alias config em `vitest.config.mts`, 22 testes iniciais.

---

### Etapa 6 — Simulador (2 sub-blocos)

A "feature mais importante" da spec. Form + 2 projections via `useMemo` + verdict + actions.

**Decisões registradas:**
- **Pessimismo no simulador**: compras em cartão tratadas como hipotéticas saídas em checking (pra mostrar impacto). Realidade do cartão é pending até pagar fatura — divergência consciente.
- 3 cenários de verdict: green (folgado), yellow (aperta), red (fura)
- Precedência: red > yellow > green
- Redirect pra `/lancamentos` após confirmar
- `projection-compute.ts` separado de `projection.ts` pra ser client-safe
- **`buildHypotheticalExpense` e `buildHypotheticalInstallments`** como funções puras testadas

**Bug retroativo (Etapa 4):** `new Date(iso)` em card-purchases foi pego pelo smoke test do simulator (que usou jan/31). Conserto: `parseISO`.

---

### Etapa 7 — Importação CSV/OFX (4 sub-blocos)

Parsers locais + pipeline de hash/dedup/parcelas + UI completa.

**Decisões registradas:**
- Parser próprio em vez de papaparse (50 linhas vs 50KB)
- Detecção de parcela conservadora (exige prefixo "PARC" ou "X de Y")
- Substring match nos learnings (Levenshtein adiada)
- File API moderna (`file.text()`) com assumption de UTF-8
- **Hash determinístico** SHA-256 sobre `(accountId, date, amount, normalizedDescription)` pra dedup
- Filtragem por hash em batch via `inArray` (1 query, não N)
- **State machine** implícito do `import_batch`: `pending_review → confirmed | discarded`
- `accountId` vem do batch, não do input do client (anti-tampering)
- Aprendizado de categoria: weight++ se mesma cat, sobrescreve se mudou
- Importa parcelas como info metadata (não cria card_purchase a partir de fatura)

---

### Etapa 8 — Importação PDF + IA + Markdown (3 sub-blocos + adendo)

Cliente Anthropic + categorização Haiku + (bonus) parser Markdown.

**Decisões registradas:**
- 3 camadas de defesa contra output bagunçado da LLM (extractJSON → Zod → domínio)
- Threshold de confidence 0.6
- Validação cruzada de kind (categoria expense só pra item expense)
- Graceful degradation: PDF parse falha = erro fatal; categorização falha = silenciosa
- `'server-only'` garantindo que API key não vaze pro client bundle
- `extractJSON` em 3 tentativas escalonadas (puro → fence → primeiro `{}`)
- `readAsDataURL` em vez de `btoa(...)` (evita stack overflow em arquivos grandes)
- Vitest stub pra `'server-only'`
- `max_tokens: 16384` no PDF parser (4k era pouco pra fatura grande)

**Adendo Markdown (introduzido após uso real):**
- PDF custou ~$0.20-0.30 por fatura (insustentável)
- Solução: usuário gera Markdown via Claude.ai (Claude Max, custo fixo) e importa o `.md`
- Parser local de Markdown (8 testes), source `'md'` adicionado
- Botão "Copiar prompt pra Claude.ai" embarcado em `/importar`
- Aviso de custo no PDF
- **Caminho preferido pro usuário:** Markdown via Claude Max (~zero custo)

**Bugs pegos:**
1. **Schemas Zod exportados em arquivos `'use server'`** — Next.js 15 só permite export de async funcs. Conserto: deixar schemas como const interno; `export type` ainda passa (tipo some em runtime).
2. **Hash duplicado vs identidade React**: dois items idênticos (compras iguais no mesmo dia) geram mesmo hash, causando warning "two children with same key" + bug funcional (toggle/edit afetava os dois). Conserto: identidade interna por índice, hash continua só pra dedup contra DB.

---

### Etapa 9 — Patrimônio (3 sub-blocos)

Snapshot mensal + cálculo de patrimônio + tela com cards/form/gráfico.

**Decisões registradas:**
- Patrimônio sempre usa `status=confirmed` (medida contábil, não projeção)
- `patrimony-compute.ts` separado pra ser client-safe (mesmo padrão do projection)
- Snapshot upsert por mês (`startOfMonth(date)` como chave) — re-salvar sobrescreve
- Cards: contas, cartões (negativo), investimentos, patrimônio líquido
- Gráfico de área com tooltip detalhado (breakdown contas/cartões/invest)
- 9 testes cobrindo computeAccountBalanceAt + computePatrimonyAt

**Comportamento esperado**: cartão com expenses pending puxa patrimônio pra baixo. Quando o usuário registra a transferência de pagamento da fatura (transfer_out checking + transfer_in cartão), o saldo do cartão volta a 0 e patrimônio sobe (já testado).

---

## Bugs descobertos durante a construção

| # | Etapa | Descrição | Como foi pego |
|---|---|---|---|
| 1 | 1.4 | `seed.ts` misturava API tradicional e relacional do Drizzle | TypeScript strict |
| 2 | 3.1 | `nextOccurrences` perdia 1 ocorrência quando `startDate` ≥ `dayOfMonth` no primeiro mês | Smoke test puro |
| 3 | 4.2 (achado em 6.1) | `new Date(iso)` deslocava parcelas em 1 dia em fuso BR (UTC vs local) | Vitest com data jan/31 |
| 4 | 7.3 | Schemas Zod exportados em arquivo `'use server'` quebram em runtime | Navegação real (Next webpack) |
| 5 | 7.4 | Hash duplicado de transactions idênticas usado como key React | Console do browser ao importar PDF |
| 6 | (env) | `ANTHROPIC_API_KEY=""` exportada vazia no shell sobrescreve `.env.local` | Debug endpoint temporário |

**Padrão observado:**
- **Bugs 1-3** foram pegos por **testes leves de funções puras**, antes do banco ou da UI consumirem o código.
- **Bugs 4-5** só apareceram em **runtime** (typecheck e Vitest passaram). Lição: navegação manual em rotas críticas após mudanças que afetam Server Actions ou identidade de listas.
- **Bug 6** foi específico de ambiente, achado por debug endpoint que mostrava `process.env` (sem expor valor). Mitigado adicionando `unset ANTHROPIC_API_KEY` no script `npm run dev`.

---

## Padrões aprendidos pra Fase 2

### Arquitetura

- **Função pura separada de função que toca db** — pra ser client-safe (`installments.ts` ↔ `cards.ts`, `projection-compute.ts` ↔ `projection.ts`, `patrimony-compute.ts` ↔ `patrimony.ts`)
- **Schemas Zod ficam const interno** em arquivos `'use server'`. `export type` (apaga em runtime) sobrevive.
- **Identidade interna da UI sempre por índice ou ULID novo**, nunca por hash de conteúdo. Hash é pra dedup, não pra `key={}` React.
- **`ActionResult<T>` compartilhado** em `lib/actions/types.ts`

### Validação

- **Validação em camadas**: Zod (forma) → query no banco (estado) → defesa final (kind compatível, etc.)
- **`safeParse` em Server Actions** (devolve `fieldErrors` estruturado)
- **`.catch({})` em URL search params** (input inválido não derruba página)

### Cálculo

- **TDD-light** em funções de cálculo: 5-10 casos sintéticos antes de plug em UI/banco
- **Função pura aceita `now: Date` como parâmetro** com default — testabilidade
- **Centavos sempre** (`Math.round(num * 100)` evita float drift)
- **`parseISO` em vez de `new Date(string)`** pra strings ISO em fuso BR

### Tratamento de erros

- **Try/catch escopado** ao que pode falhar por motivos esperados (parser, API call). Erros de programação devem subir.
- **Graceful degradation** em serviços externos opcionais (categorização Anthropic falha → segue sem sugestão; PDF parse falha → erro fatal porque é a única fonte)
- **`throw` pra bug do dev** (ex: `distributeInstallments` com input inválido); **`return null` pra erro do usuário** (ex: `parseBRL`)

### Otimização

- **`inArray` pra batch lookup** em vez de N queries
- **Throttle module-level** pra jobs não-críticos (`ensureRecurringGenerated` 60s)
- **Indexa por id em Map** quando vai fazer N lookups in-memory

---

## Estrutura do código

```
financas-app/
├── data/financas.db          # SQLite local
├── drizzle/                  # gerado pelo drizzle-kit
├── src/
│   ├── app/                  # rotas Next.js (App Router)
│   │   ├── cartoes/page.tsx
│   │   ├── config/page.tsx               # ainda placeholder
│   │   ├── importar/page.tsx
│   │   ├── lancamentos/page.tsx
│   │   ├── patrimonio/page.tsx           # ← Etapa 9
│   │   ├── recorrencias/page.tsx
│   │   ├── simulador/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                      # Dashboard (Etapa 5)
│   ├── components/
│   │   ├── ui/                           # shadcn-style: button, card, dialog,
│   │   │                                  # input, label, select, switch, table,
│   │   │                                  # checkbox
│   │   ├── header.tsx
│   │   ├── sidebar.tsx
│   │   ├── category-cell.tsx
│   │   ├── delete-card-purchase-button.tsx
│   │   ├── delete-transaction-button.tsx
│   │   ├── import-form.tsx               # CLIENT — drop zone + tabela revisão
│   │   ├── new-card-purchase-dialog.tsx
│   │   ├── new-recurring-rule-dialog.tsx
│   │   ├── new-transaction-dialog.tsx
│   │   ├── patrimony-chart.tsx           # ← Etapa 9
│   │   ├── patrimony-form.tsx            # ← Etapa 9
│   │   ├── projection-chart.tsx
│   │   ├── recurring-rule-row-actions.tsx
│   │   ├── simulator.tsx                 # CLIENT — form + 2 charts + verdict
│   │   └── transaction-filters.tsx
│   ├── db/
│   │   ├── client.ts                     # singleton SQLite com WAL + FK
│   │   ├── schema.ts                     # 8 tabelas Drizzle
│   │   └── seed.ts                       # 5 contas + 18 categorias (idempotente)
│   ├── lib/
│   │   ├── actions/                      # Server Actions
│   │   │   ├── card-purchases.ts
│   │   │   ├── imports.ts
│   │   │   ├── patrimony.ts              # ← Etapa 9
│   │   │   ├── recurring.ts
│   │   │   ├── transactions.ts
│   │   │   └── types.ts                  # ActionResult<T>
│   │   ├── parsers/                      # CSV, OFX, Markdown
│   │   │   ├── csv.ts
│   │   │   ├── markdown.ts               # ← Etapa 8 adendo
│   │   │   ├── ofx.ts
│   │   │   └── types.ts
│   │   ├── accounts.ts
│   │   ├── anthropic.ts                  # 'server-only' — cliente API
│   │   ├── boot.ts
│   │   ├── cards.ts
│   │   ├── format.ts
│   │   ├── import.ts                     # pipeline (hash, dedup, learnings)
│   │   ├── installments.ts               # PURO (client-safe)
│   │   ├── parse.ts
│   │   ├── patrimony.ts                  # ← Etapa 9 (toca banco)
│   │   ├── patrimony-compute.ts          # ← Etapa 9 PURO
│   │   ├── projection.ts                 # toca banco
│   │   ├── projection-compute.ts         # PURO (client-safe)
│   │   ├── prompts.ts                    # templates Anthropic
│   │   ├── recurring.ts
│   │   ├── reserve.ts
│   │   ├── simulator.ts                  # PURO (client-safe)
│   │   ├── transactions.ts
│   │   └── utils.ts                      # cn() helper
│   └── test-utils/
│       └── server-only-stub.ts
├── components.json                       # shadcn CLI
├── drizzle.config.ts
├── next.config.ts                        # serverExternalPackages: ['better-sqlite3']
├── package.json                          # dev: unset ANTHROPIC_API_KEY && next dev
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.mts                     # alias: 'server-only' → stub
└── .env.local                            # ANTHROPIC_API_KEY (usuário cola)
```

**Test files:**
- `src/lib/installments.test.ts` (7 testes)
- `src/lib/recurring.test.ts` (5 testes)
- `src/lib/projection.test.ts` (11 testes)
- `src/lib/reserve.test.ts` (11 testes)
- `src/lib/simulator.test.ts` (10 testes)
- `src/lib/parsers/csv.test.ts` (21 testes)
- `src/lib/parsers/ofx.test.ts` (11 testes)
- `src/lib/parsers/markdown.test.ts` (8 testes)
- `src/lib/import.test.ts` (21 testes)
- `src/lib/anthropic.test.ts` (10 testes)
- `src/lib/patrimony-compute.test.ts` (9 testes)

**Total: 124 testes, 11 arquivos**

---

## Banco de dados — estado atual

| Tabela | Linhas |
|---|---:|
| `accounts` | 5 |
| `categories` | 18 |
| `transactions` | 34 (do teste de import PDF) |
| `recurring_rules` | 0 |
| `card_purchases` | 0 |
| `import_batches` | 2 |
| `assets_snapshots` | 0 |
| `category_learnings` | 17 (aprendido com PDF) |

**TODO operacional pendente:**
- Preencher `closingDay`/`dueDay` da Amex e XP Empresa via SQL direto (até `/config` existir):
```bash
sqlite3 data/financas.db "UPDATE accounts SET closing_day=28, due_day=10 WHERE name='Amex Pessoal';"
```

---

## Custos de operação

| Operação | Custo aprox |
|---|---|
| **PDF via Anthropic Sonnet** (atual implementação) | $0.20–$0.30 por fatura |
| **Markdown via Claude.ai (Max) → parser local** | $0 (Claude Max é custo fixo) |
| **Categorização via Haiku** | $0.001–$0.005 por batch de 50 itens |
| Dev/operação local | $0 (SQLite local, sem servidor) |

**Caminho recomendado pro usuário:** Markdown via Claude.ai. Botão "Copiar prompt" embarcado em `/importar`.

---

## Fase 2 — Polimento e refinamento

### Da spec original (Etapa 10)
- [ ] Backup automático: script `scripts/backup.ts` + `npm run backup` (copia `.db` pra `backups/` com timestamp)
- [ ] Light theme (estrutura de tokens já preparada em `globals.css`)
- [ ] Atalhos de teclado (Cmd+K navegação, Cmd+N novo lançamento, etc.)

### Débitos técnicos identificados durante o desenvolvimento

| Item | Origem | Prioridade pra uso diário |
|---|---|---|
| Tela `/config` ainda placeholder | esqueleto do 1.5 | **Alta** — sem ela, ajuste de cartões precisa SQL direto |
| Modal de edit completo de transaction | nota do 2.5b | Média — hoje só edita categoria inline |
| `useOptimistic` na troca de categoria | auditoria do Eduardo | Baixa — latência perceptível mas tolerável |
| Tipo de documento (fatura vs extrato) na importação | discussão Etapa 8 adendo | Média — hoje confiamos no prompt do Claude Max |
| Limpar batches `pending_review` órfãos | Etapa 7 | Baixa — sujeira no banco, sem impacto funcional |
| Reduzir prompt PDF se voltar a usar (LLM mais firme) | Etapa 8 | Baixa — caminho Markdown é o preferido |

### Sugestões adicionais pra Fase 2

- **Edit completo de transaction** via reuso do form de criação (modal pré-preenchido)
- **Múltiplos snapshots no mesmo mês** (caso o usuário queira granularidade maior)
- **Export do DB** como JSON pra portabilidade
- **Filtro por tag** (atualmente só categorias)
- **Modo de revisão "rápido"** pra import — keyboard shortcuts

---

## Comandos úteis

```bash
cd financas-app

# Desenvolvimento
npm run dev              # localhost:3000 (com unset ANTHROPIC_API_KEY pré)
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (124 testes)
npm run test:watch       # vitest watch mode

# Banco
npm run db:push          # aplica schema.ts no SQLite
npm run db:push -- --force # forçar (ignora prompt interativo)
npm run db:studio        # interface visual (drizzle-kit)
npm run seed             # popula contas + categorias (idempotente)

# Útil pra teste manual
sqlite3 data/financas.db "SELECT * FROM transactions LIMIT 10;"
sqlite3 data/financas.db "DELETE FROM transactions;"
```

---

## Troubleshooting (lições do caminho)

### "UI quebrou, tudo cinza, fonte Times"
Cache do `.next/` corrompido (geralmente após hot-reload de env vars).

```bash
pkill -f "next dev"
rm -rf .next
npm run dev
# No browser: Cmd+Shift+R (hard reload)
```

### "ANTHROPIC_API_KEY não configurada" mesmo com .env.local preenchido
Var exportada vazia no shell tem precedência sobre `.env.local`.

```bash
unset ANTHROPIC_API_KEY
npm run dev
```

(Já incluído no script `dev` do `package.json` — só vale pra debug manual.)

### "A 'use server' file can only export async functions"
Você exportou um schema Zod ou const não-função em arquivo `'use server'`. Solução: deixar como `const` interno; `export type` (que some em runtime) sobrevive.

### "Encountered two children with the same key"
Provavelmente está usando hash de conteúdo como `key={}` React. Hash não é único por construção — dois items idênticos legítimos batem. Use índice no array ou ULID novo.

### Testes Vitest reclamam de `'server-only'`
Configurar alias no `vitest.config.mts` apontando pra stub vazio. Já feito.

### `db:push` falha com FK constraint
Acontece quando muda enum de coluna. Geralmente o enum do Drizzle é só TS-level — o SQLite aceita o valor novo nativamente sem precisar do push.

---

## Notas finais

**Cobertura de teste:** 124 testes em 11 arquivos, todos focados em **funções puras** de domínio (cálculo, parsing, validação). UI e Server Actions são exercitadas manualmente.

**Performance percebida:**
- App responde instantâneo em todas as operações locais (SQLite)
- Importar Markdown: instantâneo (parser local)
- Importar PDF: 5-15 segundos (Anthropic API)
- Categorização Haiku: 1-3 segundos por batch

**Pareamento didático:** seguido nas 9 etapas. Cada bloco abriu com "o que vou fazer / por que / como conecta / o que aconteceria sem", conceitos novos foram explicados antes do uso, pausas explícitas no fim de cada sub-bloco.

**Próxima session:** começar Fase 2 com `/config` (mais alto valor pra uso diário) ou Backup automático (defesa do que existe). PROGRESSO.md serve de checkpoint.
