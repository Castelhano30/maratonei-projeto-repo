import type { ErrorEnvelope } from '@maratonei/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, STATUS_BY_CODE } from './errors.js';

export function toEnvelope(error: AppError): ErrorEnvelope {
  return { error: { code: error.code, message: error.message, details: error.details } };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND'));
};

// Traduz erros do body-parser (http-errors) para o contrato; qualquer outro vira null.
function fromBodyParser(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null) return null;
  const { type } = error as { type?: unknown };
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  if (typeof type === 'string' && type.startsWith('entity.')) {
    return new AppError('VALIDATION_ERROR', 'O corpo da requisição é inválido.');
  }
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
    return new AppError('VALIDATION_ERROR', 'O corpo da requisição é inválido.');
  }
  return null;
}

// Só tipo, código e quadros da pilha: a mensagem do erro pode trazer host ou credencial.
function describeError(error: unknown) {
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 10)
    .map((line) => line.trim());
  const code = (error as { code?: unknown } | null)?.code;
  return {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorCode: typeof code === 'string' ? code : undefined,
    frames,
  };
}

// Quatro parâmetros: é o que o Express usa para reconhecer o tratador de erros.
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const known = error instanceof AppError ? error : fromBodyParser(error);
  const appError = known ?? new AppError('INTERNAL_ERROR');
  if (!known) req.log?.error(describeError(error), 'erro inesperado');

  res.status(STATUS_BY_CODE[appError.code]).json(toEnvelope(appError));
};
