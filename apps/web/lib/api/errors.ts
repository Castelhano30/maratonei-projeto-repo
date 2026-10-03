import type { ErrorCode, ValidationDetail } from '@maratonei/shared';

// Erro único que o cliente lança: o código vem do shared, nunca de texto livre.
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly details: ValidationDetail[] | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const UPSTREAM_UNAVAILABLE_MESSAGE = 'Não foi possível falar com o servidor.';
