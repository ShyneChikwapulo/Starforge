import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the presetCard option', () => {
  it('is off by default, so existing outputs do not change', () => {
    expect(parseConfig({ username: 'octo' }).presetCard).toBe(false);
  });

  it('works with the dark and both themes', () => {
    expect(parseConfig({ username: 'octo', presetCard: true, theme: 'dark' }).presetCard).toBe(
      true,
    );
    expect(parseConfig({ username: 'octo', presetCard: true, theme: 'both' }).presetCard).toBe(
      true,
    );
  });

  it('is refused with the light theme, since the card is dark', () => {
    expect(() => parseConfig({ username: 'octo', presetCard: true, theme: 'light' })).toThrow(
      /dark/,
    );
  });

  it('accepts only a boolean', () => {
    expect(() => parseConfig({ username: 'octo', presetCard: 'yes' })).toThrow();
  });
});
