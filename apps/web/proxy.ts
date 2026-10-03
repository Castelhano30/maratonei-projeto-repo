import { NextResponse, type NextRequest } from 'next/server';
import { loginRedirect } from './lib/session-redirect';

// Next 16: `proxy` substitui o antigo `middleware`. Só redireciona por presença de cookie (AD-13).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = loginRedirect(pathname, search, (name) => request.cookies.has(name));
  return target ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next();
}

export const config = {
  // Fora `/api` (vai à API), `/_next` e arquivos estáticos.
  matcher: ['/listas/:path*', '/conta/:path*'],
};
