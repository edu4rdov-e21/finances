import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    alias: {
      // 'server-only' é um import virtual do Next.js. Em Node puro (Vitest),
      // resolve pra stub vazio. Em runtime real, o original é usado.
      'server-only': path.resolve(
        __dirname,
        'src/test-utils/server-only-stub.ts'
      ),
    },
  },
});
