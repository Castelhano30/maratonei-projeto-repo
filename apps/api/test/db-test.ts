import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Padrão: o Postgres do docker-compose (`pnpm --filter @maratonei/api db:up`). No CI, vem do ambiente.
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://maratonei:maratonei@127.0.0.1:5433/maratonei_test';

export function testDatabaseUrl(): string {
  return process.env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
}

export const DB_DOWN_HINT =
  'Postgres de teste inacessível. Suba o container com `pnpm --filter @maratonei/api db:up` ' +
  'ou aponte TEST_DATABASE_URL para um Postgres real.';

function withDatabase(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

export type ScratchDatabase = { url: string; drop: () => Promise<void> };

// Banco descartável, criado a partir do servidor de teste, para testes que mexem no esquema.
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const name = `scratch_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: testDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  return {
    url: withDatabase(testDatabaseUrl(), name),
    drop: async () => {
      const client = new pg.Client({ connectionString: testDatabaseUrl() });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

// Utilitário de tempo (AD-15): recua uma coluna de data no banco de teste para cobrir expirações
// de 1 h, 24 h, 7 dias e 30 dias sem esperar. `where` é SQL fixo do teste, nunca entrada externa.
export async function ageTimestamps(
  client: pg.Client,
  {
    table,
    column,
    by,
    where = 'true',
  }: { table: string; column: string; by: string; where?: string },
): Promise<void> {
  if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) {
    throw new Error('Identificador inválido para ageTimestamps.');
  }
  await client.query(`UPDATE ${table} SET ${column} = ${column} - $1::interval WHERE ${where}`, [
    by,
  ]);
}
