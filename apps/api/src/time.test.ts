import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ageTimestamps, testDatabaseUrl } from '../test/db-test';

const client = new pg.Client({ connectionString: testDatabaseUrl() });

// Os prazos do produto: reset de senha 1 h, e-mail 24 h, convite e links 7 dias, sessão 30 dias.
const DEADLINES = ['1 hour', '24 hours', '7 days', '30 days'] as const;

beforeAll(async () => {
  await client.connect();
  await client.query(
    'CREATE TEMP TABLE expiring (id serial PRIMARY KEY, kind text, expires_at timestamptz NOT NULL)',
  );
});

afterAll(async () => {
  await client.end();
});

async function expiredKinds(): Promise<string[]> {
  const { rows } = await client.query(
    'SELECT kind FROM expiring WHERE expires_at <= now() ORDER BY kind',
  );
  return rows.map((row) => row.kind);
}

const age = (by: string) => ageTimestamps(client, { table: 'expiring', column: 'expires_at', by });

describe('ageTimestamps', () => {
  it('expira cada prazo só depois de recuar o tempo além dele', async () => {
    for (const deadline of DEADLINES) {
      await client.query(
        `INSERT INTO expiring (kind, expires_at) VALUES ($1::text, now() + $1::text::interval)`,
        [deadline],
      );
    }
    expect(await expiredKinds()).toEqual([]);

    await age('61 minutes');
    expect(await expiredKinds()).toEqual(['1 hour']);

    await age('24 hours');
    expect(await expiredKinds()).toEqual(['1 hour', '24 hours']);

    await age('6 days');
    expect(await expiredKinds()).toEqual(['1 hour', '24 hours', '7 days']);

    await age('23 days');
    expect(await expiredKinds()).toEqual(['1 hour', '24 hours', '30 days', '7 days']);
  });

  it('recusa identificador que não seja um nome simples de tabela ou coluna', async () => {
    await expect(
      ageTimestamps(client, {
        table: 'expiring; DROP TABLE expiring',
        column: 'expires_at',
        by: '1 day',
      }),
    ).rejects.toThrow('Identificador inválido');
  });
});
