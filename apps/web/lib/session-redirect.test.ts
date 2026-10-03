import { describe, expect, it } from 'vitest';
import { isProtectedPath, loginRedirect } from './session-redirect';

const withCookies =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name);
const none = withCookies();

describe('loginRedirect', () => {
  it('redireciona rota protegida sem cookie, guardando o caminho', () => {
    expect(loginRedirect('/listas/1', '', none)).toBe('/entrar?returnTo=%2Flistas%2F1');
    expect(loginRedirect('/listas', '?aba=assistindo', none)).toBe(
      '/entrar?returnTo=%2Flistas%3Faba%3Dassistindo',
    );
    expect(loginRedirect('/conta', '', none)).toBe('/entrar?returnTo=%2Fconta');
  });

  it.each(['better-auth.session_token', '__Secure-better-auth.session_token'])(
    'deixa passar com o cookie %s',
    (cookie) => {
      expect(loginRedirect('/listas', '', withCookies(cookie))).toBeNull();
    },
  );

  it('não toca rota pública', () => {
    for (const path of ['/', '/entrar', '/c/token', '/listasx', '/outra']) {
      expect(loginRedirect(path, '', none)).toBeNull();
    }
  });

  it('isProtectedPath casa o prefixo inteiro, não parte do nome', () => {
    expect(isProtectedPath('/listas')).toBe(true);
    expect(isProtectedPath('/listas/9')).toBe(true);
    expect(isProtectedPath('/listasx')).toBe(false);
  });

  it('o destino do redirecionamento é sempre o caminho de entrada, nunca outra origem', () => {
    const target = loginRedirect('/listas', '', none) ?? '';
    expect(target.startsWith('/entrar?returnTo=')).toBe(true);
    expect(target).not.toContain('//');
  });
});
