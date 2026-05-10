import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  // Permite drizzle-kit rodar sem URL pra alguns comandos (ex: generate),
  // mas valida na hora de aplicar. Inicialmente faz log; aplica falha cedo.
  // Quando rodar `npm run db:push`, exige a URL.
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['financas'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
