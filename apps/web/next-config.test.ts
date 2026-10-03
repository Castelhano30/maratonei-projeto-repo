import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from './next.config';

afterEach(() => vi.unstubAllEnvs());

describe('rewrites da API', () => {
  it('mantém o prazo do proxy acima dos 60 segundos do cliente', () => {
    expect(nextConfig.experimental?.proxyTimeout).toBe(120_000);
  });
  it('repassa /api/* à INTERNAL_API_URL mantendo o prefixo', async () => {
    vi.stubEnv('INTERNAL_API_URL', 'http://api.interna:3001/');

    expect(await nextConfig.rewrites?.()).toEqual([
      { source: '/api/:path*', destination: 'http://api.interna:3001/api/:path*' },
    ]);
  });
});
