// Destino padrão depois de entrar quando não há um `returnTo` válido.
export const DEFAULT_RETURN_TO = '/listas';

// `returnTo` só aceita caminho relativo da própria origem (AD-2): começa com uma barra, nunca
// com `//` nem `/\` (o navegador os trata como outra origem) e não carrega esquema nem controle.
export function safeReturnTo(value: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}
