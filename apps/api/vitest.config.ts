import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    // Os testes de banco criam e apagam bancos no mesmo servidor; um arquivo por vez evita atrito.
    fileParallelism: false,
  },
});
