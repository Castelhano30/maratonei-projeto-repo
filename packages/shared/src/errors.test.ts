import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES, errorEnvelopeSchema } from './errors';

describe('errorEnvelopeSchema', () => {
  it('aceita o envelope com detalhes nulos', () => {
    const envelope = { error: { code: 'FORBIDDEN', message: 'Acesso negado.', details: null } };
    expect(errorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('aceita detalhes de validação por campo', () => {
    const envelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        details: [{ source: 'body', field: 'name', message: 'Obrigatório' }],
      },
    };
    expect(errorEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejeita código desconhecido e origem inválida', () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'X', message: 'm', details: null } }).success,
    ).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'm',
          details: [{ source: 'headers', field: 'a', message: 'm' }],
        },
      }).success,
    ).toBe(false);
  });

  it('define os oito códigos do contrato', () => {
    expect([...ERROR_CODES]).toEqual([
      'VALIDATION_ERROR',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'PAYLOAD_TOO_LARGE',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'UPSTREAM_UNAVAILABLE',
    ]);
  });

  it('usa mensagens de validação em português', () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/inválid|esperad/i);
  });
});
