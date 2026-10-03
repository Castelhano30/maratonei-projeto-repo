import { APP_NAME } from '@maratonei/shared';
import express from 'express';
import type { Logger } from 'pino';
import { createRequestLogger } from './logger.js';

export const serviceName = `${APP_NAME} API`;

export type AppDeps = {
  logger: Logger;
};

export function createApp({ logger }: AppDeps) {
  const app = express();
  app.use(createRequestLogger(logger));
  return app;
}
