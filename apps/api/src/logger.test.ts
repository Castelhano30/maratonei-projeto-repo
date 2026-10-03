import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createLogger, redactUrl } from './logger';

type LogEntry = {
  req: { id: string; url: string; headers: Record<string, string> };
  token?: string;
};

function captureLogs() {
  const lines: string[] = [];
  const logger = createLogger('info', { write: (line: string) => void lines.push(line) });
  return {
    logger,
    lines,
    parsed: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('logs estruturados', () => {
  it('registra id de requisição e redige cookie, autorização, token e e-mail', async () => {
    const { logger, lines, parsed } = captureLogs();
    const app = createApp({ logger, checkDatabase: async () => {} });

    await request(app)
      .get('/qualquer?token=segredo-do-token&email=pessoa@exemplo.com&pagina=2')
      .set('Cookie', 'sessao=valor-do-cookie')
      .set('Authorization', 'Bearer valor-da-autorizacao')
      .set('X-Auth-Token', 'valor-do-x-auth');
    await nextTick();

    const raw = lines.join('\n');
    for (const secret of [
      'segredo-do-token',
      'pessoa@exemplo.com',
      'valor-do-cookie',
      'valor-da-autorizacao',
      'valor-do-x-auth',
    ]) {
      expect(raw).not.toContain(secret);
    }

    const [entry] = parsed();
    expect(entry?.req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry?.req.headers.cookie).toBe('[REDACTED]');
    expect(entry?.req.headers.authorization).toBe('[REDACTED]');
    expect(entry?.req.url).toContain('pagina=2');
  });

  it('gera um id novo por requisição e ignora o id enviado pelo cliente', async () => {
    const { logger, parsed } = captureLogs();
    const app = createApp({ logger, checkDatabase: async () => {} });

    const first = await request(app).get('/a').set('X-Request-Id', 'id-forjado');
    await request(app).get('/b');
    await nextTick();

    const [a, b] = parsed();
    expect(a?.req.id).not.toBe('id-forjado');
    expect(a?.req.id).not.toBe(b?.req.id);
    expect(first.headers['x-request-id']).toBe(a?.req.id);
  });

  it('redige campos sensíveis em objetos de log', () => {
    const { logger, parsed } = captureLogs();
    logger.info({ user: { email: 'a@b.com', password: 'x' }, token: 't' }, 'teste');
    const [entry] = parsed();
    expect(JSON.stringify(entry)).not.toContain('a@b.com');
    expect(entry?.token).toBe('[REDACTED]');
  });
});

describe('redactUrl', () => {
  it('mantém URLs sem query', () => {
    expect(redactUrl('/lists/1')).toBe('/lists/1');
  });

  it('mascara só as chaves sensíveis, sem diferenciar maiúsculas', () => {
    expect(redactUrl('/x?Token=abc&page=1')).toBe(
      `/x?Token=${encodeURIComponent('[REDACTED]')}&page=1`,
    );
  });
});
