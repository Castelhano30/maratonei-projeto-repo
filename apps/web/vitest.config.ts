import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    // `server-only` lança fora do servidor do Next; nos testes vira um módulo vazio.
    alias: { 'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)) },
  },
});
import { fileURLToPath } from 'node:url';
