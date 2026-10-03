import { errorEnvelopeSchema } from '@maratonei/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createLogger } from './logger';

const webOrigin = 'http://localhost:3000';

function build() {
  const effect = vi.fn();
  const app = createApp({
    logger: createLogger('silent'),
    checkDatabase: async () => {},
    webOrigin,
    routes: (router) => {
      router.get('/seguro', (_req, res) => res.json({ ok: true }));
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        router[method]('/muda', (_req, res) => {
          effect();
          res.json({ ok: true });
        });
      }
    },
  });
  return { app, effect };
}

describe('WEB_ORIGIN com barra final ou caminho', () => {
  it('compara o Origin do navegador com a origem normalizada', async () => {
    const app = createApp({
      logger: createLogger('silent'),
      checkDatabase: async () => {},
      webOrigin: 'https://app.exemplo.com/painel/',
      routes: (router) => {
        router.post('/muda', (_req, res) => res.json({ ok: true }));
      },
    });

    const response = await request(app).post('/muda').set('Origin', 'https://app.exemplo.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.exemplo.com');
  });
});

describe('cabeçalhos de segurança', () => {
  it('ativa o Helmet e remove X-Powered-By', async () => {
    const response = await request(build().app).get('/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });
});

describe('CORS', () => {
  it('aceita a origem do web, com credenciais', async () => {
    const response = await request(build().app).get('/seguro').set('Origin', webOrigin);

    expect(response.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('não concede CORS a outra origem, mas GET passa', async () => {
    const response = await request(build().app).get('/seguro').set('Origin', 'https://evil.test');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight de outra origem não recebe permissão', async () => {
    const response = await request(build().app)
      .options('/muda')
      .set('Origin', 'https://evil.test')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('checagem de Origin', () => {
  it.each(['post', 'put', 'patch', 'delete'] as const)(
    '%s com Origin fora responde 403 sem rodar o handler',
    async (method) => {
      const { app, effect } = build();
      const response = await request(app)[method]('/muda').set('Origin', 'https://evil.test');

      expect(response.status).toBe(403);
      expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('FORBIDDEN');
      expect(effect).not.toHaveBeenCalled();
    },
  );

  it('rejeita Origin "null"', async () => {
    const { app, effect } = build();
    const response = await request(app).post('/muda').set('Origin', 'null');

    expect(response.status).toBe(403);
    expect(effect).not.toHaveBeenCalled();
  });

  it('passa com Origin do web ou sem Origin', async () => {
    const { app, effect } = build();

    expect((await request(app).post('/muda').set('Origin', webOrigin)).status).toBe(200);
    expect((await request(app).post('/muda')).status).toBe(200);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('não checa métodos seguros', async () => {
    const response = await request(build().app).get('/seguro').set('Origin', 'https://evil.test');

    expect(response.status).toBe(200);
  });
});
