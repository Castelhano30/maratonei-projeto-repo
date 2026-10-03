import { DEFAULT_RETURN_TO, safeReturnTo } from '@maratonei/shared';

// Cookies de sessão do Better Auth (o prefixo `__Secure-` aparece em HTTPS).
export const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const;

export const LOGIN_PATH = '/entrar';
export const PROTECTED_PREFIXES = ['/listas', '/conta'] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Só conveniência de UX (AD-13): decide pela PRESENÇA do cookie, nunca pela validade da sessão.
// A decisão real de acesso é sempre da API. Devolve o destino do redirecionamento ou null.
export function loginRedirect(
  pathname: string,
  search: string,
  hasCookie: (name: string) => boolean,
): string | null {
  if (!isProtectedPath(pathname)) return null;
  if (SESSION_COOKIE_NAMES.some(hasCookie)) return null;
  const returnTo = safeReturnTo(`${pathname}${search}`, DEFAULT_RETURN_TO);
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}
