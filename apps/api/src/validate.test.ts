import { errorEnvelopeSchema } from '@maratonei/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app';
import { createLogger } from './logger';
import { validate } from './validate';

const body = z.object({ name: z.string(), age: z.number() });
const query = z.object({ page: z.coerce.number().int().min(1) });
const params = z.object({ id: z.uuid() });

function build() {
  return createApp({
    logger: createLogger('silent'),
    checkDatabase: async () => {},
    webOrigin: 'http://localhost:3000',
    routes: (app) => {
      app.post('/itens/:id', validate({ body, query, params }), (req, res) => {
        res.json({ valid: req.valid, rawQuery: req.query });
      });
      app.post(
        '/aninhado',
        validate({ body: z.object({ itens: z.array(z.object({ nome: z.string() })) }) }),
        (_req, res) => {
          res.json({});
        },
      );
    },
  });
}

const id = '2b1f8f0e-5b0a-4a6e-9d53-0d3f0f6c1a11';

describe('validate', () => {
  it('entrega dados convertidos em req.valid e não reescreve req.query', async () => {
    const response = await request(build())
      .post(`/itens/${id}?page=2`)
      .send({ name: 'Ana', age: 30 });

    expect(response.status).toBe(200);
    expect(response.body.valid).toEqual({
      body: { name: 'Ana', age: 30 },
      query: { page: 2 },
      params: { id },
    });
    expect(response.body.rawQuery).toEqual({ page: '2' });
  });

  it('responde 400 com um item de detalhe por campo e fonte', async () => {
    const response = await request(build()).post('/itens/xyz?page=0').send({ age: 'x' });

    expect(response.status).toBe(400);
    const { error } = errorEnvelopeSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    const pairs = (error.details ?? []).map((detail) => `${detail.source}:${detail.field}`);
    expect(pairs.sort()).toEqual(['body:age', 'body:name', 'params:id', 'query:page']);
    for (const detail of error.details ?? []) expect(detail.message.length).toBeGreaterThan(0);
  });

  it('usa mensagens em português', async () => {
    const response = await request(build()).post(`/itens/${id}?page=1`).send({ name: 'Ana' });

    const [detail] = response.body.error.details;
    expect(detail.field).toBe('age');
    expect(detail.message).toMatch(/inválid|esperad|obrigat/i);
    expect(detail.message).not.toMatch(/expected|required|invalid input/i);
  });

  it('detalha os campos quando a requisição não traz corpo JSON', async () => {
    const response = await request(build()).post(`/itens/${id}?page=1`);

    expect(response.status).toBe(400);
    const pairs = response.body.error.details.map(
      (detail: { source: string; field: string }) => `${detail.source}:${detail.field}`,
    );
    expect(pairs.sort()).toEqual(['body:age', 'body:name']);
  });

  it('usa caminho pontuado para campos aninhados', async () => {
    const response = await request(build())
      .post('/aninhado')
      .send({ itens: [{ nome: 'a' }, { nome: 1 }] });

    expect(response.body.error.details[0]).toMatchObject({
      source: 'body',
      field: 'itens.1.nome',
    });
  });
});
