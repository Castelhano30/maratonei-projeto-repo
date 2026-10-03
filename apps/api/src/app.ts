import { APP_NAME } from '@maratonei/shared';
import express from 'express';

export const serviceName = `${APP_NAME} API`;

export function createApp() {
  return express();
}
