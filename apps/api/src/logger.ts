import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pino, type DestinationStream, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REDACTED = '[REDACTED]';

// Parâmetros de query que nunca devem aparecer em log.
const SENSITIVE_QUERY_KEYS = new Set(['token', 'email', 'password', 'senha', 'code', 'state']);

// Campos redigidos em qualquer objeto de log (cabeçalhos, erros, contexto).
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["proxy-authorization"]',
  'req.headers["x-auth-token"]',
  'res.headers["set-cookie"]',
  'token',
  'password',
  'email',
  '*.token',
  '*.password',
  '*.email',
];

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  for (const key of new Set(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) params.set(key, REDACTED);
  }
  return `${url.slice(0, queryStart)}?${params.toString()}`;
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: REDACTED } }, destination);
}

export function createRequestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    // O pino-http tipa o logger com níveis fixos; o cast evita o conflito com exactOptionalPropertyTypes.
    logger: logger as never,
    // O id é sempre gerado aqui; um id enviado pelo cliente não é confiável.
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: string; method: string; url: string; headers: unknown }) => ({
        id: req.id,
        method: req.method,
        url: redactUrl(req.url),
        headers: req.headers,
      }),
    },
  }) as RequestHandler;
}
