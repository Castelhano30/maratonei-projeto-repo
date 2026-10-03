// HTTP local exercita o adapter SSR real; os cookies do Next vêm do contexto controlado.
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createServerApi } from './server';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('createServerApi', () => {
  it.each(['better-auth.session_token=abc', ''])(
    'repassa a URL interna e cookies: %s',
    async (cookie) => {
      const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ path: request.url, cookie: request.headers.cookie ?? null }));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Servidor sem porta');
        vi.stubEnv('INTERNAL_API_URL', `http://127.0.0.1:${address.port}/`);
        vi.mocked(cookies).mockResolvedValue({ toString: () => cookie } as Awaited<
          ReturnType<typeof cookies>
        >);
        const schema = z.object({ path: z.string(), cookie: z.string().nullable() });
        expect(await createServerApi().get('/api/health', schema)).toEqual({
          path: '/api/health',
          cookie: cookie || null,
        });
        expect(cookies).toHaveBeenCalledTimes(1);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );
});
