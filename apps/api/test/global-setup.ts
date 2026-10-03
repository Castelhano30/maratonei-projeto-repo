import pg from 'pg';
import { deployMigrations, defaultMigrationsDir } from '../scripts/check-migrations';
import { DB_DOWN_HINT, testDatabaseUrl } from './db-test';

const DATABASE_DOES_NOT_EXIST = '3D000';

async function tryConnect(connectionString: string) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
  return client;
}

// Volume antigo do docker-compose não roda o script de init: cria o banco de teste se faltar.
async function ensureTestDatabase(url: string) {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  target.pathname = '/postgres';
  const admin = await tryConnect(target.toString());
  try {
    await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
  } finally {
    await admin.end();
  }
}

// Antes da suíte: confirma que o Postgres existe e aplica as migrações reais no banco de teste.
export default async function setup() {
  const url = testDatabaseUrl();
  try {
    await (await tryConnect(url)).end();
  } catch (error) {
    const code = (error as { code?: string }).code;
    try {
      if (code !== DATABASE_DOES_NOT_EXIST) throw error;
      await ensureTestDatabase(url);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`${DB_DOWN_HINT}\nCausa: ${detail}`, { cause });
    }
  }
  await deployMigrations(defaultMigrationsDir, url);
}
