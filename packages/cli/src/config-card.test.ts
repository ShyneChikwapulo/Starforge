import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the card option', () => {
  it('is off by default, so existing outputs do not change', () => {
    expect(parseConfig({ username: 'octo' }).card).toBe(false);
  });

  it('can be turned on', () => {
    expect(parseConfig({ username: 'octo', card: true }).card).toBe(true);
  });

  it('accepts only a boolean', () => {
    expect(() => parseConfig({ username: 'octo', card: 'yes' })).toThrow();
  });
});
