import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pino, type DestinationStream, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REDACTED = '[REDACTED]';

// Chaves de query que nunca devem aparecer em log: qualquer nome que sugira credencial ou dado pessoal.
const SENSITIVE_QUERY_KEY = /token|secret|key|pass|senha|e-?mail|code|state|auth|otp/i;

// Campos redigidos em qualquer objeto de log (cabeçalhos, erros, contexto).
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["proxy-authorization"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'token',
  'password',
  'email',
  '*.token',
  '*.password',
  '*.email',
  '*.*.token',
  '*.*.password',
  '*.*.email',
];

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  // Só os valores sensíveis são trocados; o restante da query segue como foi enviado.
  const query = url
    .slice(queryStart + 1)
    .split('&')
    .map((pair) => {
      const separator = pair.indexOf('=');
      const key = separator === -1 ? pair : pair.slice(0, separator);
      return SENSITIVE_QUERY_KEY.test(decodeURIComponent(key)) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');
  return `${url.slice(0, queryStart)}?${query}`;
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
