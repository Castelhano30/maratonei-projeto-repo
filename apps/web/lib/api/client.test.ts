import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, RETRY_DELAYS_MS } from './client';
import { ApiError } from './errors';

const schema = z.object({ status: z.literal('ok') });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const envelope = (code: string, status: number) =>
  json({ error: { code, message: 'x', details: null } }, status);

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchMock = vi.fn<typeof fetch>();
  responses.forEach((next) => fetchMock.mockImplementationOnce(async () => next()));
  const sleep = vi.fn().mockResolvedValue(undefined);
  const client = createApiClient({ fetch: fetchMock, sleep, baseUrl: '' });
  return { fetchMock, sleep, client };
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('createApiClient: sucesso', () => {
  it('valida a resposta pelo schema e chama caminho relativo no navegador', async () => {
    const { client, fetchMock } = setup([() => json({ status: 'ok' })]);

    expect(await client.get('/api/health', schema)).toEqual({ status: 'ok' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health');
  });

  it('trata resposta fora do contrato como INTERNAL_ERROR, sem retentativa', async () => {
    const { client, fetchMock } = setup([() => json({ status: 'quebrado' })]);

    const error = await failureOf(client.get('/api/health', schema));

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createApiClient: infraestrutura', () => {
  it.each([502, 503, 504])(
    'prioriza falha de infraestrutura em %i mesmo com envelope',
    async (status) => {
      const { client, fetchMock } = setup([() => envelope('INTERNAL_ERROR', status)]);
      const error = await failureOf(client.post('/api/x', {}, schema));
      expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([502, 503, 504])('mapeia %i para UPSTREAM_UNAVAILABLE', async (status) => {
    const down = () => json({}, status);
    const { client } = setup([down, down, down]);

    const error = await failureOf(client.get('/api/x', schema));

    expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(error.status).toBe(status);
  });

  it('mapeia corpo que não é JSON (HTML do proxy) para UPSTREAM_UNAVAILABLE', async () => {
    const html = () => new Response('<html>Bad gateway</html>', { status: 200 });
    const { client } = setup([html, html, html]);

    expect((await failureOf(client.get('/api/x', schema))).code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('mapeia falha de rede para UPSTREAM_UNAVAILABLE', async () => {
    const down = () => Promise.reject(new TypeError('fetch failed'));
    const { client } = setup([down, down, down]);

    expect((await failureOf(client.get('/api/x', schema))).code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('mapeia erro com corpo JSON fora do envelope', async () => {
    const odd = () => json({ oops: true }, 500);
    const { client } = setup([odd, odd, odd]);

    expect((await failureOf(client.get('/api/x', schema))).code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('createApiClient: retentativa', () => {
  it('reexecuta GET até 2 vezes com espera crescente e devolve o sucesso', async () => {
    const { client, fetchMock, sleep } = setup([
      () => json({}, 503),
      () => json({}, 502),
      () => json({ status: 'ok' }),
    ]);

    expect(await client.get('/api/x', schema)).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([...RETRY_DELAYS_MS]);
  });

  it('desiste do GET após 2 retentativas', async () => {
    const down = () => json({}, 503);
    const { client, fetchMock } = setup([down, down, down, down]);

    await failureOf(client.get('/api/x', schema));

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'nunca reenvia %s, mesmo com a infraestrutura fora',
    async (method) => {
      const { client, fetchMock, sleep } = setup([() => json({}, 503), () => json({}, 503)]);
      const call =
        method === 'delete'
          ? client.delete('/api/x', schema)
          : client[method]('/api/x', { a: 1 }, schema);

      expect((await failureOf(call)).code).toBe('UPSTREAM_UNAVAILABLE');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it('não reexecuta erro do envelope, só infraestrutura', async () => {
    const { client, fetchMock } = setup([() => envelope('NOT_FOUND', 404)]);

    const error = await failureOf(client.get('/api/x', schema));

    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createApiClient: envelope de erro', () => {
  it('mantém o código e os detalhes de validação', async () => {
    const details = [{ source: 'body', field: 'name', message: 'Obrigatório' }];
    const { client } = setup([
      () => json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details } }, 400),
    ]);

    const error = await failureOf(client.post('/api/x', {}, schema));

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
  });
});

describe('createApiClient: tempo limite e cookie', () => {
  it('preserva cancelamento durante a leitura do corpo, sem retentativa', async () => {
    const controller = new AbortController();
    const reason = new DOMException('cancelado', 'AbortError');
    const response = json({ status: 'ok' });
    vi.spyOn(response, 'json').mockImplementation(async () => {
      controller.abort(reason);
      throw reason;
    });
    const { client, fetchMock, sleep } = setup([() => response]);
    await expect(client.get('/api/x', schema, controller.signal)).rejects.toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('não inicia outra tentativa se cancelado durante a espera', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async () => json({}, 503));
    const getCookie = vi.fn(() => undefined);
    const sleep = vi.fn(async () => controller.abort());
    const client = createApiClient({ fetch: fetchMock, getCookie, sleep });
    await expect(client.get('/api/x', schema, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCookie).toHaveBeenCalledTimes(1);
  });

  it('não inicia requisição se o sinal já estiver cancelado', async () => {
    const controller = new AbortController();
    controller.abort();
    const { client, fetchMock } = setup([]);
    await expect(client.get('/api/x', schema, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propaga erro de serialização sem chamar a rede', async () => {
    const { client, fetchMock, sleep } = setup([]);
    await expect(client.post('/api/x', { value: 1n }, schema)).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });
  it('trata tempo esgotado como UPSTREAM_UNAVAILABLE', async () => {
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('timeout', 'TimeoutError')),
        );
      });
    const fetchMock = vi.fn<typeof fetch>(hang as typeof fetch);
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {}, timeoutMs: 20 });

    const error = await failureOf(client.post('/api/x', {}, schema));

    expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('repassa o cookie e a URL interna quando chamado do servidor', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ status: 'ok' }));
    const client = createApiClient({
      baseUrl: 'http://api.interna:3001',
      fetch: fetchMock,
      getCookie: () => 'better-auth.session_token=abc',
    });

    await client.get('/api/health', schema);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.interna:3001/api/health');
    expect((init?.headers as Record<string, string>)['Cookie']).toBe(
      'better-auth.session_token=abc',
    );
  });

  it('não envia cookie quando não há um (navegador)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ status: 'ok' }));
    await createApiClient({ fetch: fetchMock }).get('/api/health', schema);

    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['Cookie']).toBeUndefined();
    expect(init?.credentials).toBe('same-origin');
  });
});
