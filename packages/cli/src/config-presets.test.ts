import { describe, expect, it } from 'vitest';
import { parseConfig, presetIds } from './config';

describe('the presets option', () => {
  it('is absent by default, so a run draws just `preset`', () => {
    const config = parseConfig({ username: 'octo' });
    expect(config.presets).toBeUndefined();
    expect(presetIds(config)).toEqual(['galaxy']);
    expect(presetIds(parseConfig({ username: 'octo', preset: 'atom' }))).toEqual(['atom']);
  });

  it('lists the presets to draw, in order', () => {
    const config = parseConfig({ username: 'octo', presets: ['tree', 'galaxy'] });
    expect(presetIds(config)).toEqual(['tree', 'galaxy']);
  });

  it('takes the place of `preset`', () => {
    const config = parseConfig({ username: 'octo', preset: 'atom', presets: ['tree'] });
    expect(presetIds(config)).toEqual(['tree']);
  });

  it('refuses an empty list, a repeated preset and an unknown one', () => {
    expect(() => parseConfig({ username: 'octo', presets: [] })).toThrow();
    expect(() => parseConfig({ username: 'octo', presets: ['tree', 'tree'] })).toThrow(/twice/);
    expect(() => parseConfig({ username: 'octo', presets: ['nope'] })).toThrow();
  });
});
