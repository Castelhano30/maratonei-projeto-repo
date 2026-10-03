// Gate de migração N-1 -> N (AD-15): aplica todas as migrações menos a última, semeia dados e
// aplica a última por cima, para provar índices, triggers e FKs em tabelas populadas.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js');

export const defaultMigrationsDir = path.join(apiRoot, 'prisma', 'migrations');

export async function deployMigrations(migrationsDir: string, databaseUrl: string) {
  try {
    await run(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: {
        ...process.env,
        MIGRATIONS_DIR: migrationsDir,
        DIRECT_URL: databaseUrl,
        DATABASE_URL: databaseUrl,
      },
    });
  } catch (error) {
    // A saída do Prisma não traz a string de conexão; ainda assim só repassamos o que ele escreveu.
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    throw new Error(`prisma migrate deploy falhou:\n${stdout}\n${stderr}`, { cause: error });
  }
}

export type CheckMigrationsOptions = {
  migrationsDir?: string;
  databaseUrl: string;
  seed: () => Promise<void>;
};

export async function checkMigrations({
  migrationsDir = defaultMigrationsDir,
  databaseUrl,
  seed,
}: CheckMigrationsOptions) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error('Nenhuma migração encontrada.');

  if (names.length < 2) {
    console.warn('Só há uma migração: o estado N-1 é vazio e o gate não exercita dados.');
  }

  const previousDir = await mkdtemp(path.join(tmpdir(), 'migrations-n1-'));
  try {
    await cp(
      path.join(migrationsDir, 'migration_lock.toml'),
      path.join(previousDir, 'migration_lock.toml'),
    );
    for (const name of names.slice(0, -1)) {
      await cp(path.join(migrationsDir, name), path.join(previousDir, name), { recursive: true });
    }
    await deployMigrations(previousDir, databaseUrl);
    await seed();
    await deployMigrations(migrationsDir, databaseUrl);
  } finally {
    await rm(previousDir, { recursive: true, force: true });
  }
}

// Uso pelo CI: `tsx scripts/check-migrations.ts` com DIRECT_URL (ou DATABASE_URL) de um banco limpo.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('Informe DIRECT_URL ou DATABASE_URL de um banco limpo.');
    process.exit(1);
  }
  await checkMigrations({
    databaseUrl: url,
    seed: async () => {
      await run(process.execPath, [prismaCli, 'db', 'seed'], {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      });
    },
  });
  console.log('Gate de migração N-1 -> N concluído.');
}
