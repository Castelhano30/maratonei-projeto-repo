import { errorEnvelopeSchema } from '@maratonei/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { AppError } from './errors';
import { createLogger } from './logger';

const webOrigin = 'http://localhost:3000';
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

function build(logger = createLogger('silent')) {
  const handler = vi.fn((_req, res) => res.json({ ok: true }));
  const app = createApp({
    logger,
    checkDatabase: async () => {},
    webOrigin,
    routes: (router) => {
      router.get('/proibido', () => {
        throw new AppError('FORBIDDEN');
      });
      router.get('/limite', () => {
        throw new AppError('RATE_LIMITED');
      });
      router.get('/quebra', () => {
        throw new Error('segredo');
      });
      router.get('/quebra-async', async () => {
        throw Object.assign(new Error('senha=segredo host=interno'), { code: 'ECONNREFUSED' });
      });
      router.post('/eco', handler);
    },
  });
  return { app, handler };
}

describe('contrato de erro', () => {
  it('erro tipado responde com o envelope e detalhes nulos', async () => {
    const response = await request(build().app).get('/proibido');

    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('FORBIDDEN');
    expect(response.body.error.details).toBeNull();
  });

  it('429 usa o mesmo envelope', async () => {
    const response = await request(build().app).get('/limite');

    expect(response.status).toBe(429);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
  });

  it('erro inesperado vira 500 sem vazar mensagem nem pilha', async () => {
    const response = await request(build().app).get('/quebra');

    expect(response.status).toBe(500);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('INTERNAL_ERROR');
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('segredo');
    expect(raw).not.toMatch(/\bat\b.*\.ts/);
  });

  it('o log do erro inesperado traz tipo, código e quadros, nunca a mensagem', async () => {
    const lines: string[] = [];
    const logger = createLogger('info', { write: (line: string) => void lines.push(line) });
    await request(build(logger).app).get('/quebra-async');
    await nextTick();

    const raw = lines.join('\n');
    expect(raw).not.toContain('segredo');
    expect(raw).not.toContain('interno');
    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((item) => item['msg'] === 'erro inesperado');
    expect(entry?.['errorType']).toBe('Error');
    expect(entry?.['errorCode']).toBe('ECONNREFUSED');
    expect((entry?.['frames'] as string[]).length).toBeGreaterThan(0);
  });

  it('rota inexistente responde 404 no envelope', async () => {
    const response = await request(build().app).get('/nao-existe');

    expect(response.status).toBe(404);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('JSON malformado responde 400 VALIDATION_ERROR sem pilha', async () => {
    const response = await request(build().app)
      .post('/eco')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('Unexpected');
    expect(JSON.stringify(response.body)).not.toContain('node_modules');
  });

  it('corpo acima de 100 kb responde 413 PAYLOAD_TOO_LARGE', async () => {
    const { app, handler } = build();
    const response = await request(app)
      .post('/eco')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ texto: 'a'.repeat(101 * 1024) }));

    expect(response.status).toBe(413);
    expect(errorEnvelopeSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(handler).not.toHaveBeenCalled();
  });
});
