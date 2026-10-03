import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createLogger, redactUrl } from './logger';

type LogEntry = {
  level: number;
  msg?: string;
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

const webOrigin = 'http://localhost:3000';
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('logs estruturados', () => {
  it('registra id de requisição e redige cookie, autorização, token e e-mail', async () => {
    const { logger, lines, parsed } = captureLogs();
    const app = createApp({ logger, checkDatabase: async () => {}, webOrigin });

    await request(app)
      .get('/qualquer?token=segredo-do-token&email=pessoa@exemplo.com&pagina=2')
      .set('Cookie', 'sessao=valor-do-cookie')
      .set('Authorization', 'Bearer valor-da-autorizacao')
      .set('X-Auth-Token', 'valor-do-x-auth')
      .set('X-Api-Key', 'valor-da-api-key')
      .set('X-Csrf-Token', 'valor-do-csrf')
      .set('Proxy-Authorization', 'valor-do-proxy');
    await nextTick();

    const raw = lines.join('\n');
    for (const secret of [
      'segredo-do-token',
      'pessoa@exemplo.com',
      'valor-do-cookie',
      'valor-da-autorizacao',
      'valor-do-x-auth',
      'valor-da-api-key',
      'valor-do-csrf',
      'valor-do-proxy',
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
    const app = createApp({ logger, checkDatabase: async () => {}, webOrigin });

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

  it('redige campos sensíveis em profundidade 2', () => {
    const { logger, lines } = captureLogs();
    logger.info(
      { a: { b: { email: 'fundo@b.com', password: 'senha-funda', token: 'tok-fundo' } } },
      'teste',
    );
    const raw = lines.join('\n');
    for (const secret of ['fundo@b.com', 'senha-funda', 'tok-fundo']) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe('nível do log de requisição', () => {
  it('usa info para 2xx, warn para 4xx e error para 5xx', async () => {
    const { logger, parsed } = captureLogs();
    const app = createApp({
      logger,
      checkDatabase: async () => {},
      webOrigin,
      routes: (router) => {
        router.get('/quebra', () => {
          throw new Error('falha interna');
        });
      },
    });

    await request(app).get('/health');
    await request(app).get('/nao-existe');
    await request(app).get('/quebra');
    await nextTick();

    // O erro inesperado também gera o próprio registro (sem `req`); aqui só contam os de requisição.
    const levels = parsed()
      .filter((entry) => entry.msg !== 'erro inesperado')
      .map((entry) => entry.level);
    expect(levels).toEqual([30, 40, 50]);
  });

  it('não registra segredo nem mensagem do driver quando /ready falha', async () => {
    const { logger, lines } = captureLogs();
    const checkDatabase = async () => {
      throw Object.assign(new Error('senha=segredo host=interno'), { code: 'ECONNREFUSED' });
    };
    await request(createApp({ logger, checkDatabase, webOrigin })).get('/ready');
    await nextTick();

    const raw = lines.join('\n');
    expect(raw).toContain('ECONNREFUSED');
    expect(raw).not.toContain('segredo');
  });
});

describe('redactUrl', () => {
  it('mantém URLs sem query', () => {
    expect(redactUrl('/lists/1')).toBe('/lists/1');
  });

  it('mascara só as chaves sensíveis, sem diferenciar maiúsculas', () => {
    expect(redactUrl('/x?Token=abc&page=1')).toBe('/x?Token=[REDACTED]&page=1');
  });

  it('cobre nomes compostos e preserva o restante da query como enviado', () => {
    expect(redactUrl('/x?access_token=a&user_email=b&q=a%20b+c&api-key=k')).toBe(
      '/x?access_token=[REDACTED]&user_email=[REDACTED]&q=a%20b+c&api-key=[REDACTED]',
    );
  });

  it('não lança com percent-encoding malformado na chave', () => {
    expect(redactUrl('/x?%E0%A4%A=1&a%=2&token=t')).toBe('/x?%E0%A4%A=1&a%=2&token=[REDACTED]');
  });

  it('responde normalmente e registra a requisição com chave malformada', async () => {
    const { logger, parsed } = captureLogs();
    const app = createApp({ logger, checkDatabase: async () => {}, webOrigin });

    const response = await request(app).get('/health?%E0%A4%A=1');
    await nextTick();

    expect(response.status).toBe(200);
    expect(parsed()).toHaveLength(1);
  });
});
