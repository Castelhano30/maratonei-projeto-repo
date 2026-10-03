import { createApp, serviceName } from './app.js';
import { EnvError, loadEnv } from './env.js';
import { createDatabaseCheck } from './health.js';
import { createLogger } from './logger.js';

try {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const checkDatabase = createDatabaseCheck(env.DATABASE_URL);
  createApp({ logger, checkDatabase }).listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `${serviceName} ouvindo`);
  });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
