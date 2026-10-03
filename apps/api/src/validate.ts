import type { ValidationDetail, ValidationSource } from '@maratonei/shared';
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './errors.js';

export type ValidatedData = Partial<Record<ValidationSource, unknown>>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Dados já validados e convertidos pelos schemas; nunca reescreve req.query.
      valid: ValidatedData;
    }
  }
}

export type ValidationSchemas = Partial<Record<ValidationSource, ZodType>>;

const SOURCES: ValidationSource[] = ['body', 'query', 'params'];

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const valid: ValidatedData = {};
    const details: ValidationDetail[] = [];

    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source]);
      if (result.success) {
        valid[source] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ source, field: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      next(new AppError('VALIDATION_ERROR', undefined, details));
      return;
    }
    req.valid = valid;
    next();
  };
}
