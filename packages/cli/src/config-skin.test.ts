import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the skin option', () => {
  it('defaults to cyberpunk, so existing outputs do not change', () => {
    expect(parseConfig({ username: 'octo' }).skin).toBe('cyberpunk');
  });

  it('accepts a known skin', () => {
    expect(parseConfig({ username: 'octo', skin: 'cyberpunk' }).skin).toBe('cyberpunk');
  });

  it('refuses an unknown skin', () => {
    expect(() => parseConfig({ username: 'octo', skin: 'neon-pink' })).toThrow();
  });
});
