# Finanças App

App pessoal de controle financeiro. Local-first, importação automática de extrato/fatura, simulador de compra com saldo projetado.

## Pré-requisitos

- Node.js 20+
- Uma chave da Anthropic API (obtém em https://console.anthropic.com)

## Setup inicial (do zero)

```bash
# 1. Instalar dependências
npm install

# 2. Inicializar shadcn/ui (interativo — escolha New York style, dark default)
npx shadcn@latest init

# 3. Adicionar componentes shadcn que vamos usar
npx shadcn@latest add button card dialog input label select table tabs switch sonner

# 4. Configurar Tailwind v4 e variáveis CSS conforme spec.md §9 (design system)

# 5. Criar arquivo de ambiente
cp .env.example .env.local
# Edite .env.local e cole sua ANTHROPIC_API_KEY

# 6. Criar pasta do banco
mkdir -p data

# 7. Criar tabelas no SQLite
npm run db:push

# 8. Popular contas do Eduardo + categorias default
npm run seed

# 9. Subir o app
npm run dev
```

Abre `http://localhost:3000` no navegador.

## Comandos do dia-a-dia

```bash
npm run dev          # roda em dev
npm run db:studio    # abre interface visual do SQLite (Drizzle Studio)
npm run backup       # faz uma cópia do .db com timestamp em backups/
```

## Estrutura

```
financas-app/
├── spec.md                    # ⭐ documento mestre, leia primeiro
├── src/
│   ├── app/                   # rotas Next.js (App Router)
│   ├── db/
│   │   ├── schema.ts          # ⭐ modelo de dados Drizzle (já pronto)
│   │   └── seed.ts            # ⭐ contas iniciais + categorias (já pronto)
│   ├── lib/
│   │   ├── prompts.ts         # ⭐ templates da Anthropic API (já pronto)
│   │   ├── anthropic.ts       # cliente da API (a construir)
│   │   ├── projection.ts      # saldo projetado (a construir)
│   │   ├── reserve.ts         # cálculo de reserva mínima (a construir)
│   │   └── duplicates.ts      # detecção de duplicatas (a construir)
│   └── components/            # componentes UI
├── data/                      # arquivo SQLite (não commitar)
└── backups/                   # cópias do .db (não commitar)
```

## Para construir com Claude Code

1. Abra esta pasta no Cursor ou rode `claude` na raiz
2. Peça pro Claude Code ler `spec.md` por inteiro — **com atenção especial à §2 (modo de trabalho didático)**
3. Siga a ordem de implementação descrita na §10 do spec
4. Cada etapa deve resultar em algo rodável antes de passar pra próxima
5. Ao final de cada etapa, peça pro Claude pausar e perguntar se algum conceito precisa ser explicado melhor antes de avançar

## Convenções importantes

- Valores monetários: SEMPRE em centavos (integer) no DB e na lib. Conversão pra Real só na renderização.
- Datas: ISO 8601 no DB. Locale pt-BR só na UI.
- TypeScript estrito, zero `any`.

## Backup

O arquivo `data/financas.db` contém todos os seus dados. Recomendações:

1. Aponte `DATABASE_URL` pra uma pasta sincronizada (iCloud Drive, Google Drive desktop)
2. Rode `npm run backup` periodicamente — copia pra `backups/` com timestamp
3. Versione `data/` no `.gitignore` (já está)
