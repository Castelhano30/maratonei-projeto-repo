import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkMigrations,
  defaultMigrationsDir,
  deployMigrations,
} from '../scripts/check-migrations';
import { createScratchDatabase, type ScratchDatabase } from '../test/db-test';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'test', 'fixtures');
const scratch: ScratchDatabase[] = [];

async function newDatabase() {
  const database = await createScratchDatabase();
  scratch.push(database);
  return database;
}

async function connect(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((database) => database.drop()));
});

describe('migrações em banco limpo', () => {
  it('aplicam a migração de base e deixam o banco consultável', async () => {
    const { url } = await newDatabase();
    await deployMigrations(defaultMigrationsDir, url);

    const client = await connect(url);
    try {
      const applied = await client.query('SELECT migration_name FROM _prisma_migrations');
      expect(applied.rows.map((row) => row.migration_name)).toContain('0001_base');
      expect((await client.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
    } finally {
      await client.end();
    }
  });
});

describe('migração N-1 -> N sobre dados', () => {
  async function migrateFixtures() {
    const { url } = await newDatabase();
    const seedSql = await readFile(path.join(fixturesDir, 'seed.sql'), 'utf8');
    const seededBeforeLast: number[] = [];
    await checkMigrations({
      migrationsDir: path.join(fixturesDir, 'migrations'),
      databaseUrl: url,
      seed: async () => {
        const client = await connect(url);
        try {
          await client.query(seedSql);
          const { rows } = await client.query('SELECT count(*)::int AS n FROM fx_member');
          seededBeforeLast.push(rows[0].n);
          // No estado N-1 as constraints da última migração ainda não existem.
          const indexes = await client.query(
            `SELECT 1 FROM pg_indexes WHERE indexname = 'fx_member_one_owner'`,
          );
          expect(indexes.rowCount).toBe(0);
        } finally {
          await client.end();
        }
      },
    });
    return { url, seededBeforeLast };
  }

  it('aplica a última migração sem perder linhas semeadas', async () => {
    const { url, seededBeforeLast } = await migrateFixtures();
    const client = await connect(url);
    try {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM fx_member');
      expect(seededBeforeLast).toEqual([3]);
      expect(rows[0].n).toBe(3);
    } finally {
      await client.end();
    }
  });

  it('aplica índice parcial, trigger e FKs compostas valendo sobre as tabelas populadas', async () => {
    const { url } = await migrateFixtures();
    const client = await connect(url);
    try {
      // Índice parcial: um segundo OWNER na mesma lista é rejeitado.
      await expect(
        client.query(`INSERT INTO fx_member (list_id, user_id, role) VALUES (1, 12, 'OWNER')`),
      ).rejects.toMatchObject({ code: '23505' });

      // Trigger: o OWNER não muda de papel.
      await expect(
        client.query(`UPDATE fx_member SET role = 'EDITOR' WHERE list_id = 1 AND user_id = 10`),
      ).rejects.toThrow('o dono não pode mudar de papel');

      // FK composta: progresso de quem não participa da lista é rejeitado.
      await expect(
        client.query(
          `INSERT INTO fx_progress (list_item_id, list_id, user_id) VALUES (100, 1, 99)`,
        ),
      ).rejects.toMatchObject({ code: '23503' });

      // Cascata pela FK composta: remover o participante apaga o progresso dele.
      await client.query('DELETE FROM fx_member WHERE list_id = 1 AND user_id = 11');
      const { rows } = await client.query(
        'SELECT user_id FROM fx_progress WHERE list_id = 1 ORDER BY user_id',
      );
      expect(rows).toEqual([{ user_id: 10 }]);
    } finally {
      await client.end();
    }
  });

  it('falha quando uma migração não cabe nos dados semeados', async () => {
    const { url } = await newDatabase();
    await expect(
      checkMigrations({
        migrationsDir: path.join(fixturesDir, 'migrations'),
        databaseUrl: url,
        seed: async () => {
          const client = await connect(url);
          try {
            // Dois OWNER na mesma lista: o índice parcial da última migração não pode ser criado.
            await client.query(`
              INSERT INTO fx_list (id) VALUES (1);
              INSERT INTO fx_member (list_id, user_id, role) VALUES (1, 1, 'OWNER'), (1, 2, 'OWNER');`);
          } finally {
            await client.end();
          }
        },
      }),
    ).rejects.toThrow('prisma migrate deploy falhou');
  });
});
