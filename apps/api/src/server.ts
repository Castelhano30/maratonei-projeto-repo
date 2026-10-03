import { createApp, serviceName } from './app.js';
import { createPrisma } from './db.js';
import { EnvError, loadEnv } from './env.js';
import { createDatabaseCheck } from './health.js';
import { createLogger } from './logger.js';

try {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const checkDatabase = createDatabaseCheck(env.DATABASE_URL);
  // Ainda sem rotas de dados: o cliente existe para as histórias seguintes e fecha com o processo.
  const db = createPrisma(env.DATABASE_URL);
  const server = createApp({ logger, checkDatabase, webOrigin: env.WEB_ORIGIN }).listen(
    env.PORT,
    () => {
      logger.info({ port: env.PORT }, `${serviceName} ouvindo`);
    },
  );
  server.on('close', () => {
    db.$disconnect().catch(() => logger.error('falha ao fechar o pool do banco'));
  });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
