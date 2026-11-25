import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { measureCardText } from './card-text';
import { renderInfoCardSvg } from './info-card';
import { avoidWidow } from './info-legend';

describe('avoidWidow', () => {
  it('moves the last word of the line above onto a one-word last line', () => {
    expect(avoidWidow(['SHOWING THE LARGEST 10 OF', '14.'], 13, 1, 864)).toEqual([
      'SHOWING THE LARGEST 10',
      'OF 14.',
    ]);
  });

  it('leaves alone a last line that is not a widow, a single line, and a pair that would not fit', () => {
    const fine = ['ONE TWO', 'THREE FOUR'];
    expect(avoidWidow(fine, 13, 1, 864)).toEqual(fine);
    expect(avoidWidow(['ONLY'], 13, 1, 864)).toEqual(['ONLY']);
    const tight = ['LONGLINE WORD', 'END'];
    expect(avoidWidow(tight, 13, 1, measureCardText('WORD END', 13, 1) - 1)).toEqual(tight);
  });
});

describe('legends on the cards', () => {
  it('do not end on a lone word, even with 14 languages', () => {
    const base = createSampleMetrics();
    const many: Metrics = {
      ...base,
      languages: Array.from({ length: 14 }, (_, i) => ({
        ...base.languages[i % base.languages.length]!,
        name: `Language ${i + 1}`,
      })),
    };
    const labels = [
      ...renderInfoCardSvg(many, { card: 'languages' }).matchAll(/aria-label="([^"]*)"/g),
    ].map((m) => m[1]!);
    const sync = labels.findIndex((label) => label.startsWith('SYNC'));
    expect(sync).toBeGreaterThan(0);
    expect(labels[sync - 1]).toContain(' ');
  });
});
