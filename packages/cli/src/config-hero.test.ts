import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the hero options', () => {
  it('are off by default, so existing outputs do not change', () => {
    const config = parseConfig({ username: 'octo' });
    expect(config.hero).toBe(false);
    expect(config.heroCharacter).toBeUndefined();
  });

  it('can be turned on with a character folder', () => {
    const config = parseConfig({ username: 'octo', hero: true, heroCharacter: 'assets/rita' });
    expect(config.hero).toBe(true);
    expect(config.heroCharacter).toBe('assets/rita');
  });

  it('accept only the right types', () => {
    expect(() => parseConfig({ username: 'octo', hero: 'yes' })).toThrow();
    expect(() => parseConfig({ username: 'octo', heroCharacter: '' })).toThrow();
  });
});
