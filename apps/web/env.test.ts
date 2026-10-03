import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('env do web', () => {
  it.each(['http://api.interna?x=1', 'http://api.interna#segredo'])(
    'recusa URL com query ou fragmento: %s',
    (url) => expect(() => parseEnv({ INTERNAL_API_URL: url })).toThrow('INTERNAL_API_URL'),
  );
  it('usa a API local por padrão', () => {
    expect(parseEnv({}).INTERNAL_API_URL).toBe('http://localhost:3001');
  });

  it('aceita https e recusa outro esquema sem revelar o valor', () => {
    expect(parseEnv({ INTERNAL_API_URL: 'https://api.interna' }).INTERNAL_API_URL).toBe(
      'https://api.interna',
    );
    expect(() => parseEnv({ INTERNAL_API_URL: 'ftp://segredo-host' })).toThrow('INTERNAL_API_URL');
    expect(() => parseEnv({ INTERNAL_API_URL: 'ftp://segredo-host' })).not.toThrow(/segredo-host/);
  });
});
