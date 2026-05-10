// Stub usado pelo Vitest pra resolver `import 'server-only'` em teste.
// O `server-only` real do Next.js joga erro se for carregado em browser
// runtime. Pra teste em Node (Vitest), só precisamos de um módulo vazio.
export {};
