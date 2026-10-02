import { describe, expect, it } from 'vitest';
import { APP_NAME } from './index';

describe('shared', () => {
  it('exporta o nome do app para web e API', () => {
    expect(APP_NAME).toBe('Maratonei');
  });
});
