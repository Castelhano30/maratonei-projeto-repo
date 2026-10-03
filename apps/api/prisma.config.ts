import { defineConfig } from 'prisma/config';

// Migrações usam DIRECT_URL (conexão direta); o app usa DATABASE_URL (pooler). Só local, sem
// DIRECT_URL, cai em DATABASE_URL. MIGRATIONS_DIR existe para o gate de migração N-1 -> N.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: process.env['MIGRATIONS_DIR'] ?? 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
});
