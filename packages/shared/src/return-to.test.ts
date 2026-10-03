import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each(['/listas', '/listas/1?aba=assistindo', '/c/abc123', '/'])('aceita %s', (value) => {
    expect(safeReturnTo(value)).toBe(value);
  });

  it.each([
    '//evil.com',
    'https://evil.com',
    'http://evil.com/listas',
    '/\\evil.com',
    '\\\\evil.com',
    'listas',
    'javascript:alert(1)',
    '/listas\nSet-Cookie: x=1',
    '/a\\b',
    '',
  ])('rejeita %j e devolve o destino padrão', (value) => {
    expect(safeReturnTo(value)).toBe(DEFAULT_RETURN_TO);
  });

  it('rejeita o que não é texto e respeita o destino alternativo', () => {
    expect(safeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO);
    expect(safeReturnTo(['/listas'])).toBe(DEFAULT_RETURN_TO);
    expect(safeReturnTo('//x', '/inicio')).toBe('/inicio');
  });
});
