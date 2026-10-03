import { z } from 'zod';

// Mensagens de validação em português para todo schema do shared (AD-11).
z.config(z.locales.pt());

// Códigos que existem hoje; os demais nascem na história que os usa.
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const VALIDATION_SOURCES = ['body', 'query', 'params'] as const;

export type ValidationSource = (typeof VALIDATION_SOURCES)[number];

export const validationDetailSchema = z.object({
  source: z.enum(VALIDATION_SOURCES),
  // Caminho pontuado até o campo, por exemplo `items.0.name`; vazio quando o erro é da raiz.
  field: z.string(),
  message: z.string(),
});

export type ValidationDetail = z.infer<typeof validationDetailSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(validationDetailSchema).nullable(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
