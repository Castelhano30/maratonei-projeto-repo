import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { AppError } from './errors.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function securityHeaders(): RequestHandler {
  return helmet();
}

// Só a origem do web recebe `Access-Control-Allow-Origin`; as demais ficam sem o cabeçalho.
export function corsPolicy(webOrigin: string): RequestHandler {
  return cors({
    origin: (origin, callback) => callback(null, origin === webOrigin),
    credentials: true,
  });
}

// `Origin` fora da origem do web em método que muda estado é 403, antes de qualquer efeito.
// `Origin` ausente passa (cliente que não é navegador e SSR): isso não prova confiança;
// a autorização é de cada rota.
export function checkOrigin(webOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('Origin');
    if (STATE_CHANGING_METHODS.has(req.method) && origin !== undefined && origin !== webOrigin) {
      next(new AppError('FORBIDDEN'));
      return;
    }
    next();
  };
}
