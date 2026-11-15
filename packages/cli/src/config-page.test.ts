import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the page options', () => {
  it('are off by default, so existing outputs do not change', () => {
    const config = parseConfig({ username: 'octo' });
    expect(config.page).toBe(false);
    expect(config.divider).toBeUndefined();
  });

  it('work with the dark and both themes', () => {
    expect(parseConfig({ username: 'octo', page: true, theme: 'dark' }).page).toBe(true);
    expect(parseConfig({ username: 'octo', page: true, theme: 'both' }).page).toBe(true);
  });

  it('refuse the light theme, since the page is dark', () => {
    expect(() => parseConfig({ username: 'octo', page: true, theme: 'light' })).toThrow(/dark/);
  });

  it('accept a divider title only with page', () => {
    expect(parseConfig({ username: 'octo', page: true, divider: 'Presets' }).divider).toBe(
      'Presets',
    );
    expect(() => parseConfig({ username: 'octo', divider: 'Presets' })).toThrow(/page/);
  });
});
