import type { ErrorCode, ValidationDetail } from '@maratonei/shared';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_UNAVAILABLE: 502,
};

export const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Dados inválidos.',
  UNAUTHENTICATED: 'É preciso entrar para continuar.',
  FORBIDDEN: 'Você não tem permissão para isso.',
  NOT_FOUND: 'Não encontrado.',
  PAYLOAD_TOO_LARGE: 'O conteúdo enviado é grande demais.',
  RATE_LIMITED: 'Muitas tentativas. Tente de novo em instantes.',
  INTERNAL_ERROR: 'Algo deu errado. Tente de novo em instantes.',
  UPSTREAM_UNAVAILABLE: 'Um serviço de que dependemos está indisponível.',
};

// Erro esperado: o código e a mensagem aqui escritos são seguros para ir ao cliente.
export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    message: string = DEFAULT_MESSAGE[code],
    public readonly details: ValidationDetail[] | null = null,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}
