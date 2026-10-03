import { errorEnvelopeSchema } from '@maratonei/shared';
import type { ZodType } from 'zod';
import { ApiError, UPSTREAM_UNAVAILABLE_MESSAGE } from './errors';

// Cobre a partida a frio da API gratuita (cerca de 60 s, AD-17).
export const REQUEST_TIMEOUT_MS = 60_000;
export const RETRY_DELAYS_MS = [500, 1500] as const;

const UPSTREAM_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_METHODS = new Set(['GET']);

export type ApiClientOptions = {
  // Vazio no navegador (caminho relativo `/api/...`); `INTERNAL_API_URL` no servidor do Next.
  baseUrl?: string;
  fetch?: typeof fetch;
  // Cookie a repassar quando a chamada parte do servidor (SSR).
  getCookie?: () => string | undefined | Promise<string | undefined>;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export type RequestOptions<T> = {
  method?: string;
  body?: unknown;
  schema: ZodType<T>;
  signal?: AbortSignal;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const upstreamUnavailable = (status: number | null = null) =>
  new ApiError('UPSTREAM_UNAVAILABLE', UPSTREAM_UNAVAILABLE_MESSAGE, status);

export function createApiClient(options: ApiClientOptions = {}) {
  const {
    baseUrl = '',
    fetch: fetchImpl = (...args) => fetch(...args),
    getCookie,
    sleep = defaultSleep,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = options;

  async function attempt<T>(path: string, request: RequestOptions<T>): Promise<T> {
    request.signal?.throwIfAborted();
    const method = (request.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    const cookie = await getCookie?.();
    request.signal?.throwIfAborted();
    if (cookie) headers['Cookie'] = cookie;

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const body = request.body === undefined ? null : JSON.stringify(request.body);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      // Cancelamento pedido por quem chamou não é falha de infraestrutura.
      if (request.signal?.aborted) throw error;
      throw upstreamUnavailable();
    }

    if (UPSTREAM_STATUSES.has(response.status)) throw upstreamUnavailable(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (request.signal?.aborted) throw error;
      // Corpo que não é JSON (página de erro do proxy, por exemplo).
      throw upstreamUnavailable(response.status);
    }

    if (!response.ok) {
      const envelope = errorEnvelopeSchema.safeParse(payload);
      if (!envelope.success) throw upstreamUnavailable(response.status);
      const { code, message, details } = envelope.data.error;
      throw new ApiError(code, message, response.status, details);
    }

    const parsed = request.schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError('INTERNAL_ERROR', 'Resposta fora do contrato.', response.status);
    }
    return parsed.data;
  }

  // Só GET é reexecutado, e só quando a infraestrutura falhou. Mutação nunca é reenviada sozinha.
  async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
    const retryable = RETRYABLE_METHODS.has((options.method ?? 'GET').toUpperCase());
    for (let retry = 0; ; retry += 1) {
      try {
        return await attempt(path, options);
      } catch (error) {
        const delay = RETRY_DELAYS_MS[retry];
        const canRetry =
          retryable &&
          delay !== undefined &&
          error instanceof ApiError &&
          error.code === 'UPSTREAM_UNAVAILABLE';
        if (!canRetry) throw error;
        await sleep(delay);
      }
    }
  }

  return {
    request,
    get: <T>(path: string, schema: ZodType<T>, signal?: AbortSignal) =>
      request(path, { schema, ...(signal ? { signal } : {}) }),
    post: <T>(path: string, body: unknown, schema: ZodType<T>) =>
      request(path, { method: 'POST', body, schema }),
    put: <T>(path: string, body: unknown, schema: ZodType<T>) =>
      request(path, { method: 'PUT', body, schema }),
    patch: <T>(path: string, body: unknown, schema: ZodType<T>) =>
      request(path, { method: 'PATCH', body, schema }),
    delete: <T>(path: string, schema: ZodType<T>) => request(path, { method: 'DELETE', schema }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
