import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPoolConfig,
  createPrisma,
  isConnectionReset,
  POOL_IDLE_TIMEOUT_MS,
  withReadRetry,
} from './db';
import { testDatabaseUrl } from '../test/db-test';

const url = testDatabaseUrl();
const db = createPrisma(url);
const admin = new pg.Client({ connectionString: url });

// Encerra, do lado do servidor, todas as conexões do banco de teste, menos a do próprio admin.
async function resetServerConnections() {
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
}

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('conexão com Postgres real', () => {
  it('aplica a migração de base e responde a uma consulta', async () => {
    const migrations = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(migrations.map((row) => row.migration_name)).toContain('0001_base');
    expect(await db.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
  });

  it('configura o pool com idleTimeout abaixo dos 5 min em que o Neon suspende', () => {
    const { idleTimeoutMillis } = createPoolConfig(url);
    expect(idleTimeoutMillis).toBe(POOL_IDLE_TIMEOUT_MS);
    expect(idleTimeoutMillis).toBeGreaterThan(0);
    expect(idleTimeoutMillis).toBeLessThan(5 * 60 * 1000);
  });
});

describe('reset de conexão', () => {
  // A conexão é morta no meio da transação, o que torna a falha determinística.
  const readThatLosesItsConnection = () =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      await resetServerConnections();
      return tx.$queryRaw`SELECT 2 AS value`;
    });

  it('reexecuta uma leitura uma vez e devolve o resultado', async () => {
    let calls = 0;
    const result = await withReadRetry(async () => {
      calls += 1;
      return calls === 1 ? readThatLosesItsConnection() : db.$queryRaw`SELECT 2 AS value`;
    });

    expect(calls).toBe(2);
    expect(result).toEqual([{ value: 2 }]);
  });

  it('propaga o erro quando a segunda tentativa também falha', async () => {
    let calls = 0;
    await expect(
      withReadRetry(async () => {
        calls += 1;
        return readThatLosesItsConnection();
      }),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it('não reexecuta erro que não é de conexão', async () => {
    let calls = 0;
    await expect(
      withReadRetry(async () => {
        calls += 1;
        return db.$queryRawUnsafe('SELECT * FROM tabela_que_nao_existe');
      }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('não reexecuta escrita: sem withReadRetry, o erro de conexão propaga uma vez', async () => {
    let attempts = 0;
    const write = async () => {
      attempts += 1;
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`CREATE TEMP TABLE write_probe (id int)`;
        await resetServerConnections();
        await tx.$executeRaw`INSERT INTO write_probe VALUES (1)`;
      });
    };

    const failure = await write().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(isConnectionReset(failure)).toBe(true);
    expect(attempts).toBe(1);
  });
});
