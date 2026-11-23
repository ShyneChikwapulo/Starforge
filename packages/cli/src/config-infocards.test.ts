import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

describe('the infoCards option', () => {
  it('is absent by default, so existing outputs do not change', () => {
    expect(parseConfig({ username: 'octo' }).infoCards).toBeUndefined();
  });

  it('lists the cards to draw', () => {
    expect(
      parseConfig({ username: 'octo', infoCards: ['heatmap', 'languages'] }).infoCards,
    ).toEqual(['heatmap', 'languages']);
  });

  it('refuses an unknown card, an empty-string card and a repeat', () => {
    expect(() => parseConfig({ username: 'octo', infoCards: ['nope'] })).toThrow();
    expect(() => parseConfig({ username: 'octo', infoCards: [''] })).toThrow();
    expect(() => parseConfig({ username: 'octo', infoCards: ['heatmap', 'heatmap'] })).toThrow(
      /twice/,
    );
  });
});
