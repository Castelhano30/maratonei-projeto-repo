import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

// O Neon suspende a computação após 5 min parada: o pool descarta conexões ociosas antes disso (AD-17).
export const POOL_IDLE_TIMEOUT_MS = 4 * 60 * 1000;

export type Database = PrismaClient;

export function createPoolConfig(connectionString: string) {
  return { connectionString, idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS };
}

export function createPrisma(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg(createPoolConfig(connectionString)) });
}

const RESET_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  '57P01', // admin_shutdown (conexão encerrada pelo servidor)
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  'P1017', // Prisma: o servidor fechou a conexão
]);

// O pg não dá código a estas duas: conexão já morta no pool e conexão cortada no meio da consulta.
const RESET_MESSAGES = [
  'Client has encountered a connection error and is not queryable',
  'Connection terminated unexpectedly',
];

// Procura o código na cadeia de causas, porque o Prisma e o driver embrulham o erro original.
export function isConnectionReset(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      cause?: unknown;
      meta?: { code?: unknown; driverAdapterError?: unknown };
      originalCode?: unknown;
      message?: unknown;
    };
    const { message } = candidate;
    if (typeof message === 'string' && RESET_MESSAGES.some((text) => message.includes(text))) {
      return true;
    }
    for (const code of [candidate.code, candidate.originalCode, candidate.meta?.code]) {
      if (typeof code === 'string' && RESET_CODES.has(code)) return true;
    }
    current = candidate.cause ?? candidate.meta?.driverAdapterError;
  }
  return false;
}

// Só para leitura: repetir uma escrita poderia duplicá-la (AD-17).
export async function withReadRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isConnectionReset(error)) throw error;
    return read();
  }
}
