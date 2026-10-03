import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const valid = { DATABASE_URL: 'postgresql://usuario:senha-secreta@localhost:5432/maratonei' };

describe('parseEnv', () => {
  it('aplica os padrões quando só as obrigatórias existem', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      DATABASE_URL: valid.DATABASE_URL,
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it('converte a porta para número', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('falha citando a variável obrigatória ausente', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL: variável obrigatória ausente/);
  });

  it('falha com valor inválido sem imprimir o valor recebido', () => {
    const attempt = () => parseEnv({ ...valid, PORT: 'abc', LOG_LEVEL: 'segredo-123' });
    expect(attempt).toThrow(/PORT: valor inválido/);
    expect(attempt).toThrow(/LOG_LEVEL: valor inválido/);
    try {
      attempt();
    } catch (error) {
      expect((error as Error).message).not.toContain('segredo-123');
      expect((error as Error).message).not.toContain('abc');
    }
  });

  it('rejeita DATABASE_URL que não seja de Postgres, sem imprimir o valor', () => {
    const attempt = () => parseEnv({ DATABASE_URL: 'mysql://usuario:senha-x@host/db' });
    expect(attempt).toThrow(/DATABASE_URL: valor inválido/);
    expect(attempt).not.toThrow(/senha-x/);
  });

  it('aceita WEB_ORIGIN válida e rejeita valor que não é URL', () => {
    expect(parseEnv({ ...valid, WEB_ORIGIN: 'https://app.exemplo.com' }).WEB_ORIGIN).toBe(
      'https://app.exemplo.com',
    );
    expect(() => parseEnv({ ...valid, WEB_ORIGIN: 'nao-e-url' })).toThrow(
      /WEB_ORIGIN: valor inválido/,
    );
  });

  it('rejeita porta fora do intervalo', () => {
    expect(() => parseEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });
});
