import { APP_NAME } from '@maratonei/shared';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { createHealthRouter, type DatabaseCheck } from './health.js';
import { createRequestLogger } from './logger.js';
import { checkOrigin, corsPolicy, securityHeaders } from './security.js';

export const serviceName = `${APP_NAME} API`;

export type AppDeps = {
  logger: Logger;
  checkDatabase: DatabaseCheck;
  webOrigin: string;
  // Monta as rotas antes do 404 e do tratador de erros.
  routes?: (app: Express) => void;
};

export function createApp({ logger, checkDatabase, webOrigin, routes }: AppDeps) {
  const origin = new URL(webOrigin).origin;
  const app = express();
  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(securityHeaders());
  app.use(corsPolicy(origin));
  app.use(checkOrigin(origin));
  app.use(express.json({ limit: '100kb' }));
  app.use(createHealthRouter(checkDatabase));
  routes?.(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
