import net from 'node:net';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createDatabaseCheck } from './health';
import { createLogger } from './logger';

const logger = createLogger('silent');

// Porta 1 nunca tem Postgres: a conexão é recusada de verdade, sem mock do banco.
const UNREACHABLE_URL = 'postgresql://usuario:senha@127.0.0.1:1/maratonei';

describe('GET /health', () => {
  it('responde 200 sem consultar o banco', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('banco fora'));
    const response = await request(createApp({ logger, checkDatabase })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(checkDatabase).not.toHaveBeenCalled();
  });

  it('responde 200 mesmo com o banco inalcançável', async () => {
    const app = createApp({ logger, checkDatabase: createDatabaseCheck(UNREACHABLE_URL) });
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });
});

describe('GET /ready', () => {
  it('responde 200 quando a checagem do banco passa', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const response = await request(createApp({ logger, checkDatabase })).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('responde 503 quando a checagem falha, sem vazar o motivo', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('senha=segredo host=interno'));
    const response = await request(createApp({ logger, checkDatabase })).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(response.body)).not.toContain('segredo');
  });

  it('responde 503 com um banco realmente inalcançável', async () => {
    const app = createApp({ logger, checkDatabase: createDatabaseCheck(UNREACHABLE_URL) });
    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
  });
});

describe('createDatabaseCheck com servidor que aceita e não responde', () => {
  it('divide uma checagem entre chamadas simultâneas e respeita o prazo total', async () => {
    const sockets: net.Socket[] = [];
    const server = net.createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as net.AddressInfo;

    try {
      const check = createDatabaseCheck(`postgresql://u:p@127.0.0.1:${port}/db`, 200);
      const startedAt = Date.now();
      const results = await Promise.allSettled([check(), check(), check()]);
      const elapsed = Date.now() - startedAt;

      expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
      expect(sockets).toHaveLength(1);
      expect(elapsed).toBeLessThan(1500);
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

// Roda quando há um Postgres de teste disponível (o CI ganha esse serviço na 0.5).
describe.skipIf(!process.env['TEST_DATABASE_URL'])('GET /ready com Postgres real', () => {
  it('responde 200 com o banco acessível', async () => {
    const url = process.env['TEST_DATABASE_URL'] as string;
    const app = createApp({ logger, checkDatabase: createDatabaseCheck(url) });
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
  });
});
