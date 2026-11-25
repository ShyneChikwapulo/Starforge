import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the skinAccent option', () => {
  it('is absent by default, so existing outputs do not change', () => {
    expect(parseConfig({ username: 'octo' }).skinAccent).toBeUndefined();
  });

  it('takes a colour on the default skin', () => {
    expect(
      parseConfig({ username: 'octo', skin: 'default', skinAccent: '#ff2e88' }).skinAccent,
    ).toBe('#ff2e88');
    expect(parseConfig({ username: 'octo', skin: 'default', skinAccent: '#f28' }).skinAccent).toBe(
      '#f28',
    );
  });

  it('refuses to recolour the cyberpunk skin, and says why', () => {
    expect(() => parseConfig({ username: 'octo', skinAccent: '#ff2e88' })).toThrow(/skin only/);
    expect(() =>
      parseConfig({ username: 'octo', skin: 'cyberpunk', skinAccent: '#ff2e88' }),
    ).toThrow(/skin only/);
  });

  it('refuses a value that is not a hex colour, or is too dark to see', () => {
    expect(() => parseConfig({ username: 'octo', skin: 'default', skinAccent: 'pink' })).toThrow(
      /must be a colour/,
    );
    expect(() => parseConfig({ username: 'octo', skin: 'default', skinAccent: '#222222' })).toThrow(
      /too dark.*:1/,
    );
  });
});
