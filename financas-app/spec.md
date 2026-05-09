# Finanças App — Especificação Técnica

App pessoal de controle financeiro inspirado na lógica da Planilha do Breno (foco em saldo projetado e decisão de compra), com importação automática de extratos e categorização via Anthropic API.

Este documento é o cérebro do projeto. O Claude Code deve lê-lo inteiro antes de começar a construir, e consultá-lo sempre que tiver dúvida arquitetural.

---

## 1. Visão geral

**Usuário:** Eduardo, uso pessoal único (sem multi-tenant).

**Problema que resolve:** responder com confiança a pergunta "posso fazer essa compra agora sem furar nos próximos meses?", considerando renda variável, parcelas em aberto, despesas fixas e reserva mínima. Tudo isso enquanto separa PF de PJ no mesmo arquivo.

**Diferencial vs planilha:** importação automática de extrato/fatura (o app extrai e categoriza), aprendizado de categorias por correção, simulador visual de impacto, multi-conta nativo.

**Não-objetivos (out of scope):** gestão de investimentos detalhada, relatórios fiscais, multi-usuário, mobile nativo, sincronização cloud.

---

## 2. Modo de trabalho — pareamento didático

**Esta é uma instrução comportamental crítica. Releia antes de cada etapa.**

O Eduardo está usando este projeto também pra **aprender backend e frontend**. Não é um contratante recebendo entrega — é um pareamento. Você (Claude Code) constrói **explicando enquanto constrói**, no nível de quem está aprendendo a lógica por trás das decisões.

### 2.1 Estrutura de cada bloco de trabalho

Antes de escrever código novo (componente, função, schema, server action, qualquer coisa significativa), apresente um bloco curto com:

1. **O que vou fazer agora** — escopo objetivo do bloco. Uma frase.
2. **Por que assim** — qual a abordagem escolhida e por que ela vence as alternativas. Cite trade-offs reais.
3. **Como isso conecta com o resto** — o que esse pedaço alimenta ou depende dele.
4. **O que aconteceria se não tivesse** — o contrafactual. Que problema concreto surgiria se a gente pulasse esse pedaço ou fizesse "do jeito ingênuo".

Depois de implementar, faça um **recap de 3-4 linhas**: o que foi criado, onde mora no projeto, e qual a próxima dependência que precisa antes de avançar.

### 2.2 Conceitos novos exigem definição antes do uso

Quando aparecer pela primeira vez um conceito que o Eduardo provavelmente não domina, **explique o conceito antes de usar**. Lista de conceitos que provavelmente vão aparecer e devem ser explicados na primeira vez:

**Backend:**
- ORM (vs SQL puro): por que a gente usa Drizzle ao invés de escrever queries direto
- Migrations: por que não dá pra só "alterar o banco" e o que aconteceria sem elas
- Server Actions vs API Routes: quando usar qual
- Validação Zod no boundary: por que validar input mesmo confiando no client
- Centavos vs float: por que `0.1 + 0.2 !== 0.3` em JavaScript e o que isso causa em finanças
- Idempotência: o que significa e por que jobs precisam ser idempotentes
- Hash determinístico pra dedup: por que hash ao invés de comparar campos um a um
- Foreign keys e referential integrity

**Frontend:**
- App Router vs Pages Router: por que a gente foi de App Router
- Server Components vs Client Components: a regra mental pra decidir qual usar em cada caso
- Hidratação: o que é e quando ela quebra
- Forms com Server Actions: como o Next.js elimina a necessidade de fetch manual
- Tailwind utility-first: por que classes ao invés de CSS modular, e o trade-off
- shadcn copy-paste: por que componentes são copiados pra dentro do projeto ao invés de instalados via npm
- Estado: quando é estado de servidor (não precisa useState) vs estado de UI (precisa)

**Cross-cutting:**
- TypeScript estrito: o que `strict: true` previne e por que vale o atrito
- Zod schemas como fonte única de verdade entre client/server
- Por que o Drizzle expõe tipos via `$inferSelect` e como isso elimina duplicação

Não precisa explicar tudo de uma vez — explique conforme aparecer. Mas explique antes do uso, não depois.

### 2.3 Cadência e checkpoints

- **Não despeje 200 linhas de código de uma vez.** Quebre em pedaços de 20-50 linhas com explicação no meio.
- Ao final de cada **etapa** da §10 (Ordem de implementação), pause e pergunte: "Algum conceito que apareceu nesta etapa que você quer que eu explique melhor antes de a gente continuar?"
- Se o Eduardo perguntar "por quê?" sobre alguma decisão, responda com o trade-off real. Nunca diga só "é a melhor prática" — explique a melhor prática.
- Se o Eduardo perguntar "e se a gente fizesse de outro jeito?", construa a alternativa mentalmente e mostre o que pioraria.

### 2.4 Tom

- Técnico mas acessível. Não infantilize ("vamos fazer um joguinho legal"). Não jargonize sem explicar.
- Quando usar um termo técnico pela primeira vez, defina entre parênteses: "vamos rodar uma migration (script versionado que altera o schema do banco)".
- Erre pro lado de explicar a mais. É melhor o Eduardo dizer "já entendi, pode pular" do que ele ficar perdido em silêncio.
- Quando uma decisão é gosto pessoal e não técnica, diga isso explicitamente ("tanto faz, eu prefiro X porque Y, mas Z funcionaria").

### 2.5 Exemplos do formato esperado

**Exemplo bom — antes de criar `lib/projection.ts`:**

> Próximo bloco: **`lib/projection.ts`**, a função que calcula o saldo projetado pros próximos 12 meses.
>
> **O que vou fazer:** uma função `getProjectedBalance(monthsAhead, ownership, hypothetical?)` que retorna um array com saldo previsto no fim de cada mês.
>
> **Por que assim:** projeção é cálculo puro a partir do estado atual + transações futuras. Calcular sob demanda (cada vez que o dashboard pede) é mais simples que tentar manter uma tabela "saldo_por_mês" sincronizada — porque qualquer transação nova invalidaria a tabela. Como o volume é pequeno (12 meses × poucas centenas de lançamentos), o custo é desprezível.
>
> **Como conecta:** dashboard chama essa função no carregamento. Simulador chama a mesma função passando `hypothetical` pra ver o impacto antes/depois.
>
> **Sem isso:** o app vira só um caderno de gastos passados, perde o diferencial. Você nunca saberia "se eu comprar isso hoje, em qual mês meu saldo fura".

**Exemplo ruim (não fazer):**

> Vou criar projection.ts com a função getProjectedBalance.
> ```ts
> [200 linhas de código sem explicação]
> ```
> Pronto, próximo passo é o dashboard.

---

## 3. Stack técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript | Full-stack num projeto só, Claude Code domina |
| Estilo | Tailwind CSS v4 + shadcn/ui | Componentes prontos e polidos, sem reinventar UI |
| ORM | Drizzle | Mais simples que Prisma, type-safe, migrations diretas |
| DB | SQLite via `better-sqlite3` | Local-first, zero servidor, arquivo único pra backup |
| LLM | `@anthropic-ai/sdk` (Claude) | Parsing de PDF e categorização |
| Charts | Recharts | Padrão React, cobre gráficos de linha e barra que precisamos |
| Datas | `date-fns` | Manipulação de datas em PT-BR |
| Validação | Zod | Schemas de input compartilhados client/server |
| Ícones | `lucide-react` | Padrão shadcn |

**Roda como:** `npm run dev` → `localhost:3000`. Quando quiser empacotar como app desktop nativo, migrar pra Tauri (não no MVP).

**Backup:** o arquivo `data/financas.db` deve ser deixado numa pasta sincronizada (iCloud/Drive). Criar script `scripts/backup.ts` que copia o `.db` com timestamp pra `backups/`.

---

## 4. Modelo de dados (Drizzle schemas)

Todas as tabelas usam `id` como PK (text, ulid). Datas são `text` em ISO 8601. Valores monetários são `integer` em **centavos** (evita float drift). Campos opcionais são nullable.

### `accounts` — contas e cartões
```
id            text pk
name          text          -- "Itaú PF", "Amex Pessoal", "XP Empresa"
kind          text          -- 'checking' | 'credit_card'
ownership     text          -- 'PF' | 'PJ'
initial_balance integer     -- saldo inicial em centavos (signed)
currency      text default 'BRL'
closing_day   integer null  -- só pra credit_card: dia do fechamento da fatura
due_day       integer null  -- só pra credit_card: dia do vencimento
archived      integer default 0
created_at    text
```

### `categories` — categorias de transação
```
id            text pk
name          text          -- "Mercado", "Transporte"
kind          text          -- 'expense' | 'income'
ownership     text          -- 'PF' | 'PJ' | 'both'
icon          text null     -- nome do ícone lucide
color         text null     -- hex
archived      integer default 0
```

### `transactions` — todo lançamento individual
```
id              text pk
account_id      text fk -> accounts.id
category_id     text fk -> categories.id (nullable até categorizar)
date            text          -- ISO date
amount          integer       -- centavos. Sempre positivo. Tipo define sinal:
kind            text          -- 'expense' | 'income' | 'transfer_out' | 'transfer_in'
description     text
notes           text null
recurring_rule_id text null fk -> recurring_rules.id  -- se gerada por regra
card_purchase_id text null fk -> card_purchases.id    -- se é parcela de compra
transfer_id     text null     -- liga transfer_out e transfer_in (mesmo id nas duas pontas)
import_batch_id text null fk -> import_batches.id
external_hash   text null     -- hash da linha do extrato pra dedup
status          text default 'confirmed'  -- 'confirmed' | 'pending'
created_at      text
```

### `recurring_rules` — geram transactions automaticamente
```
id            text pk
account_id    text fk
category_id   text fk
kind          text          -- 'expense' | 'income'
description   text          -- "Aluguel", "Salário Empresa X"
amount        integer       -- centavos
day_of_month  integer       -- dia do mês que ocorre (1-31, 31 = último dia)
start_date    text
end_date      text null     -- null = indefinido
active        integer default 1
```

### `cards` — view derivada de `accounts` onde kind='credit_card'. Não é tabela separada.

### `card_purchases` — compras parceladas
```
id            text pk
account_id    text fk -> accounts.id (deve ser kind='credit_card')
category_id   text fk
description   text
total_amount  integer       -- centavos
installments  integer       -- número de parcelas (1 = à vista no cartão)
first_installment_date text  -- data da primeira parcela
created_at    text
```

Cada compra parcelada gera N transactions com `card_purchase_id` preenchido. Parcela = `total_amount / installments`. Resto vai na última parcela pra fechar exato.

### `transfers` — view conceitual. Implementada como duas transactions (`transfer_out` + `transfer_in`) com mesmo `transfer_id`.

### `assets_snapshots` — fotografia mensal do patrimônio
```
id            text pk
date          text          -- primeiro dia do mês de referência
account_id    text null fk  -- se for snapshot de conta específica
investments   integer       -- soma dos investimentos manuais (centavos)
notes         text null
created_at    text
```

### `import_batches` — controle de importações
```
id            text pk
account_id    text fk
source        text          -- 'pdf' | 'csv' | 'ofx'
filename      text
imported_at   text
total_rows    integer
status        text          -- 'pending_review' | 'confirmed' | 'discarded'
```

### `category_learnings` — aprendizado de categorização
```
id            text pk
description_pattern text   -- regex ou substring normalizada
category_id   text fk
weight        integer default 1   -- aumenta a cada confirmação
last_used_at  text
```

Quando o usuário corrige uma categoria sugerida pela LLM, grava aqui. Próxima importação consulta primeiro essa tabela antes de chamar a API.

---

## 5. Setup inicial (seed)

Ao primeiro boot, popular o DB com:

**Contas pré-cadastradas:**
- `Amex Pessoal` — credit_card, PF (closing_day e due_day a confirmar com Eduardo)
- `Itaú PF` — checking, PF
- `Cora PF` — checking, PF (usado pra débito e Pix)
- `XP Empresa` — credit_card, PJ
- `InfinitePay PJ` — checking, PJ

Saldos iniciais começam em 0. Eduardo ajusta na tela de Config quando subir o app.

**Categorias de despesa default:**
Mercado, Transporte, Lazer, Saúde, Casa, Assinaturas, Educação, Trabalho, Impostos, Tarifas Bancárias, Outros

**Categorias de entrada default:**
Salário, Freelance, Faturamento PJ, Reembolso, Outros

**Categoria especial:**
`Transferência` — kind='expense' e 'income' duplicados, marca interno. Não entra no consolidado.

---

## 6. Telas

### 5.1 Layout base
- Sidebar fixa à esquerda com 7 itens: Dashboard, Lançamentos, Recorrências, Cartões, Patrimônio, Simulador, Config
- Header superior com seletor PF/PJ/Consolidado e mês atual
- Conteúdo principal scrollable

### 5.2 Dashboard (`/`)
**Cards superiores (4):**
1. Saldo atual consolidado (soma de todas as contas checking, exclui cartões)
2. Lucro/prejuízo do mês corrente (entradas - saídas)
3. Reserva mínima recomendada (cálculo abaixo) vs reserva atual
4. Total de fatura aberta (soma das parcelas futuras de todos os cartões)

**Gráfico principal:** linha do saldo projetado próximos 12 meses, com banda da reserva mínima destacada.

**Lista lateral:** próximas 10 transações (entradas + saídas) ordenadas por data.

**Alertas:** badges visíveis quando: algum mês projetado fica abaixo da reserva, ou negativo.

### 5.3 Lançamentos (`/lancamentos`)
- Tabela paginada com filtros: data range, conta, categoria, tipo, busca por descrição
- Botão "+ Novo lançamento" abre modal: tipo (entrada/saída/transferência), conta, valor, data, categoria, descrição, notas
- Botão "Importar extrato" leva pra `/importar`
- Inline edit de categoria (clica → dropdown)

### 5.4 Recorrências (`/recorrencias`)
- Lista de regras ativas: descrição, valor, dia do mês, conta, categoria
- Botão "+ Nova recorrência"
- Pra cada regra: switch ativar/desativar, edit, delete
- Job de geração: roda ao abrir o app — pra cada regra ativa, garante que existem transactions criadas pros próximos 12 meses (ignora se já existem)

### 5.5 Cartões (`/cartoes`)
- Cards com nome do cartão, fatura aberta, próximo fechamento, próximo vencimento
- Ao clicar num cartão: lista de compras do mês + compras parceladas em aberto
- Botão "+ Nova compra parcelada": abre modal — descrição, valor total, parcelas, mês de início, categoria
- Cria N transactions automaticamente

### 5.6 Patrimônio (`/patrimonio`)
- Snapshot do mês atual: saldo de cada conta + campo manual de investimentos
- Botão "Salvar snapshot" grava em `assets_snapshots`
- Gráfico: evolução do patrimônio total nos últimos 12 meses
- Tabela com snapshots históricos

### 5.7 Simulador (`/simulador`)
**A feature mais importante.** Inputs:
- Descrição (opcional)
- Valor total
- Parcelas (1 = à vista)
- Mês de início (default: este mês)
- Forma de pagamento: cartão (escolhe qual) ou conta direto (escolhe qual)
- Categoria (sugerida automaticamente pela LLM com base na descrição)

**Output:** dois gráficos lado a lado dos próximos 12 meses:
- Gráfico A: saldo projetado SEM a compra
- Gráfico B: saldo projetado COM a compra

Cada mês ganha um semáforo:
- 🟢 Verde: saldo > reserva mínima
- 🟡 Amarelo: saldo entre 0 e reserva mínima
- 🔴 Vermelho: saldo negativo

Mensagem de veredicto no topo: "Pode comprar com folga", "Pode comprar mas vai apertar em mês X", "Não recomendado, fura no mês X".

Dois botões no rodapé:
- **Confirmar compra**: cria transactions reais (e card_purchase se parcelado)
- **Descartar simulação**

### 5.8 Importar (`/importar`)
- Drop zone aceita PDF, CSV, OFX
- Seletor de conta de destino
- Após upload: chama API → mostra tabela de revisão com lançamentos extraídos, categoria sugerida, flag de duplicata
- Usuário marca/desmarca, edita categoria, confirma → grava no DB
- Persiste `category_learnings` pra correções

Detalhe: ao confirmar, agrupa parcelas detectadas ("PARC 3/12") em `card_purchases`.

### 5.9 Config (`/config`)
- Aba Contas: lista, edita saldos iniciais, dia de fechamento/vencimento dos cartões, arquiva
- Aba Categorias: CRUD
- Aba Reserva: configurar % do gasto médio (default 30%) e janela (default 3 meses)
- Aba API: campo pra colar `ANTHROPIC_API_KEY` (ou ler do .env)
- Aba Backup: botão "Exportar backup agora" → copia o .db pra pasta de backup com timestamp

---

## 7. Lógica de domínio

### 6.1 Saldo atual
Soma do saldo inicial de todas as contas `checking` da ownership selecionada + soma de todas as transactions confirmadas (entradas positivas, saídas negativas, transferências se anulam por terem mesma conta? não — transferências entre contas movem dinheiro, então afetam saldo individual mas não o consolidado).

Implementação: `getCurrentBalance(ownership: 'PF' | 'PJ' | 'both')`.

### 6.2 Saldo projetado
Para cada um dos próximos 12 meses, calcular:

```
saldo_fim_mes_N = saldo_fim_mes_N-1
                + soma(transactions previstas no mês N)
                - soma(parcelas de cartão vencendo no mês N)
                - soma(recorrências de despesa do mês N)
                + soma(recorrências de entrada do mês N)
```

Onde "saldo_fim_mes_0" = saldo atual.

Cuidado: transactions já existentes em meses futuros (ex: parcelas geradas) NÃO devem ser duplicadas pelas recorrências. A função `getProjectedBalance` deve respeitar isso.

Implementação: `lib/projection.ts` exporta `getProjectedBalance(monthsAhead, ownership, hypothetical?)`. O parâmetro `hypothetical` permite o simulador injetar uma compra fictícia.

### 6.3 Reserva mínima
```
reserva = (soma_despesas_ultimos_3_meses / 3) * pct
```

Default `pct = 0.3` (30%). Configurável em `/config`. Despesas = transactions kind='expense' + recorrências expense, exclui transferências.

Implementação: `lib/reserve.ts`.

### 6.4 Recorrências
Job idempotente que roda no boot e ao salvar uma regra:
- Pra cada `recurring_rules` ativa, calcula as próximas 12 ocorrências
- Pra cada ocorrência, verifica se já existe transaction com mesmo `recurring_rule_id` + mesmo mês — se não, cria com status='pending'
- Quando o dia chega ou usuário confirma, vira 'confirmed'

### 6.5 Parcelamento
Ao criar `card_purchases`:
- Calcula valor base = `floor(total / installments)` em centavos
- Resto = `total - (base * installments)` vai na última parcela
- Cria N transactions com kind='expense', amount=valor da parcela, date = first_installment_date + (i meses), status='pending'

### 6.6 Transferências PJ↔PF (e entre quaisquer contas)
Sempre cria DUAS transactions com mesmo `transfer_id` (ulid novo):
- Uma `transfer_out` na conta origem
- Uma `transfer_in` na conta destino
- Categoria fixa "Transferência"

No consolidado (ownership='both'), transferências entre PF e PJ se cancelam matematicamente porque uma é positiva e outra negativa. Não precisa filtrar.

### 6.7 Detecção de duplicatas (importação)
Pra cada linha extraída do extrato:
1. Calcular `external_hash = sha256(account_id + date + amount + normalize(description))`
2. Buscar transactions existentes com mesmo hash
3. Se achou: marcar como duplicata sugerida na UI, default desmarcado
4. Se não achou: marcar como nova, default marcado

---

## 8. Importação e categorização (Anthropic API)

### 7.1 Fluxo
```
1. Usuário sobe arquivo (PDF/CSV/OFX) + escolhe conta destino
2. Backend salva arquivo temp e cria import_batch (status pending_review)
3. Se CSV/OFX: parser local extrai linhas (mais barato e rápido)
   Se PDF: chama API com o PDF como input → recebe JSON estruturado
4. Pra cada linha extraída: tenta categorizar via category_learnings (match local)
5. Pras não-categorizadas: chama API em batch (uma chamada com todas as descrições)
6. Detecta parcelas ("PARC 2/10", "2/10", "Parc 2 de 10") via regex e agrupa
7. Detecta duplicatas (hash)
8. Retorna pra UI tabela de revisão
9. Usuário ajusta, confirma → cria transactions + atualiza category_learnings
```

### 7.2 Parser PDF — prompt template

Modelo: `claude-opus-4-7` ou `claude-sonnet-4-6` (sonnet basta pra esse caso e é mais barato).

**System prompt:**
```
Você extrai lançamentos de extratos bancários e faturas de cartão brasileiros. Retorne APENAS JSON válido, sem texto adicional, no formato:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string limpa",
      "amount_cents": número inteiro (positivo),
      "kind": "expense" | "income",
      "installment_info": {"current": N, "total": M} | null
    }
  ]
}

Regras:
- amount_cents sempre positivo, kind define direção
- Para faturas de cartão, todos os lançamentos são "expense" exceto estornos (que são "income")
- Limpe a descrição: remova códigos repetidos, datas redundantes, prefixos de operação
- Detecte parcelas em padrões como "PARC X/Y", "X DE Y", "X/Y" e preencha installment_info
- Se a moeda não for BRL, ainda assim extraia (campo currency opcional)
- Ignore linhas de saldo, totais, taxas duplicadas com lançamentos
```

**User message:** anexar o PDF como `document` no content array.

### 7.3 Categorizador — prompt template

Modelo: `claude-haiku-4-5` (rápido e baratíssimo, suficiente).

**System prompt:**
```
Você categoriza despesas e receitas pessoais brasileiras. Receberá uma lista de descrições e uma lista de categorias disponíveis. Retorne APENAS JSON:
{
  "categorizations": [
    {"index": 0, "category_id": "...", "confidence": 0.0-1.0}
  ]
}

Use o id "outros" quando não tiver certeza (confidence < 0.6).
```

**User message:**
```
Categorias disponíveis:
[lista de {id, name, kind}]

Descrições para categorizar:
0. UBER *TRIP HELP UBER COM (R$ 23,50, expense)
1. IFOOD *RESTAURANTE X (R$ 47,80, expense)
...
```

### 7.4 Aprendizado
Quando usuário corrige uma sugestão (`category_id_sugerida != category_id_confirmada`):
- Cria/atualiza linha em `category_learnings` com `description_pattern = normalize(description)` e `category_id = confirmada`
- Próxima importação: antes de chamar API, normaliza descrição e busca por substring/levenshtein nessa tabela

Normalização: lowercase, remove acentos, remove números longos, remove asteriscos e símbolos, colapsa espaços.

---

## 9. Convenções de código

- TypeScript estrito (`strict: true` no tsconfig)
- Server Actions pra mutations (não criar API routes desnecessárias)
- Componentes em `src/components/`, lib em `src/lib/`, db em `src/db/`
- Nomes de arquivos: kebab-case (`saldo-projetado.ts`)
- Componentes React: PascalCase
- Funções: camelCase, prefixo `get` pra leitura, `create/update/delete` pra mutations
- Datas sempre em ISO no DB, formatadas pra exibição via `date-fns/format` com locale pt-BR
- Valores monetários: SEMPRE em centavos no DB e na lib, formatação `formatBRL(cents)` só no UI
- Zero uso de `any`. Se precisar, usa `unknown` + narrowing
- Erros de domínio: classe `DomainError` com `code` semântico

### Design system
- **Tom:** refinado, denso onde precisa (tabelas), espaçoso onde respira (dashboard). Não-corporativo, não-bancário.
- **Tipografia:** display `Fraunces` (serif moderna), body `Geist Sans`, números/dados `Geist Mono`. Vetado: Inter, Roboto, Arial.
- **Paleta dark default:**
  - bg base: `#0E0E0C` (off-black quente)
  - bg surface: `#161614`
  - texto primário: `#F5F1E8`
  - acento positivo: `#7FB069` (verde-floresta)
  - acento negativo: `#C44536` (rosé-tijolo, não vermelho cliché)
  - acento neutro: `#D4A574` (caramelo)
- Light theme opcional, mesma estrutura
- Sem gradientes roxo, sem glassmorphism, sem ícone gigante centralizado em página vazia
- Tabelas densas, números monoespaçados, alinhamento à direita pra valores

---

## 10. Ordem de implementação sugerida

Construir incrementalmente. Cada etapa deve resultar em algo rodável.

**Etapa 1 — Setup (1 dia):**
1. `npm install` deps do package.json
2. Configurar Tailwind, shadcn (`npx shadcn@latest init`)
3. Criar `src/db/schema.ts` (já vem pronto no scaffolding)
4. Configurar Drizzle: `drizzle-kit push` cria o DB
5. Rodar `seed.ts` pra popular contas e categorias do Eduardo
6. Layout base: sidebar + header + página dashboard placeholder

**Etapa 2 — CRUD de lançamentos (1-2 dias):**
1. Tela `/lancamentos` lista as transactions
2. Modal de novo lançamento (entrada/saída)
3. Server actions de create/update/delete
4. Filtros e busca

**Etapa 3 — Recorrências (1 dia):**
1. CRUD em `/recorrencias`
2. Job de geração ao salvar regra
3. Job de geração no boot do app

**Etapa 4 — Cartões e parcelamento (1-2 dias):**
1. Tela `/cartoes`
2. Compras parceladas
3. Cálculo de fatura aberta

**Etapa 5 — Saldo projetado e dashboard (2 dias):**
1. `lib/projection.ts`
2. `lib/reserve.ts`
3. Dashboard com gráfico e cards

**Etapa 6 — Simulador (1-2 dias):**
1. `/simulador` UI
2. Reusa `getProjectedBalance` com `hypothetical`
3. Renderização do semáforo

**Etapa 7 — Importação CSV/OFX (2 dias):**
1. Parser local de CSV e OFX
2. Tela `/importar` com revisão
3. Detecção de duplicatas e parcelas
4. Confirmação grava em batch

**Etapa 8 — Importação PDF + categorização API (2 dias):**
1. `lib/anthropic.ts` cliente
2. `lib/prompts.ts` templates
3. Integração no fluxo de `/importar`
4. `category_learnings` com aprendizado

**Etapa 9 — Patrimônio (1 dia):**
1. `/patrimonio` com snapshots
2. Gráfico de evolução

**Etapa 10 — Polimento:**
1. Backup automático
2. Atalhos de teclado
3. Light theme

---

## 11. Variáveis de ambiente

```
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=./data/financas.db
```

A API key fica só no servidor (Next.js server actions). Nunca expor no client.

---

## 12. Comandos rápidos

```bash
npm install
npx drizzle-kit push       # cria/atualiza schema do SQLite
npm run seed               # popula contas e categorias iniciais
npm run dev                # sobe em localhost:3000
npm run backup             # copia o .db pra backups/ com timestamp
```

---

## 13. Princípios pro Claude Code seguir

1. **Type-first**: definir tipos e schemas Zod antes de UI
2. **Server-first**: lógica de negócio em `lib/`, não em componentes
3. **Idempotência**: jobs (recorrências, geração de parcelas) podem rodar várias vezes sem efeito colateral
4. **Centavos sempre**: zero conversão pra float em qualquer lugar do backend
5. **Dedup defensivo**: importação nunca duplica, sempre confere external_hash
6. **Pessimismo no projetado**: pendências contam como se fossem confirmar (melhor superestimar despesas)
7. **Sem decisão financeira automática**: o app sugere, usuário confirma. Nunca executa transação real fora do registro.
