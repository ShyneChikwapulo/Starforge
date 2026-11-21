import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the default skin option', () => {
  it('is accepted, and works with the other options', () => {
    const config = parseConfig({ username: 'octo', skin: 'default', hero: true, page: true });
    expect(config.skin).toBe('default');
  });
});
