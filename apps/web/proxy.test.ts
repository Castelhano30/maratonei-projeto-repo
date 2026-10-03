import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe('matcher do proxy', () => {
  it.each(['/listas', '/listas/1', '/listas/a.b', '/conta', '/conta/a.b'])(
    'intercepta %s',
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it.each([
    '/api/health',
    '/_next/static/chunk.js',
    '/_next/image',
    '/favicon.ico',
    '/logo.png',
    '/entrar',
    '/',
  ])('ignora %s', (path) => {
    expect(matches(path)).toBe(false);
  });
});

describe('proxy', () => {
  const request = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : {});

  it('redireciona rota protegida sem cookie para a entrada, com returnTo', () => {
    const response = proxy(request('/listas/1'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/entrar?returnTo=%2Flistas%2F1',
    );
  });

  it('segue quando há o cookie de sessão, sem julgar o valor', () => {
    const response = proxy(request('/listas', 'better-auth.session_token=qualquer'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('segue em rota pública', () => {
    expect(proxy(request('/')).headers.get('location')).toBeNull();
  });
});
