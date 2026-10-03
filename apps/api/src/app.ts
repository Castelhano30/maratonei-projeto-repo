import { APP_NAME } from '@maratonei/shared';
import express from 'express';
import type { Logger } from 'pino';
import { createHealthRouter, type DatabaseCheck } from './health.js';
import { createRequestLogger } from './logger.js';

export const serviceName = `${APP_NAME} API`;

export type AppDeps = {
  logger: Logger;
  checkDatabase: DatabaseCheck;
};

export function createApp({ logger, checkDatabase }: AppDeps) {
  const app = express();
  app.use(createRequestLogger(logger));
  app.use(createHealthRouter(checkDatabase));
  return app;
}
