import { describe, expect, it } from 'vitest';
import type { GenerateResult } from './generate';
import { formatStepOutputs } from './outputs';

const result: GenerateResult = {
  directory: '/out',
  animation: '/out/galaxy.webp',
  poster: '/out/galaxy-poster.png',
  legend: '/out/galaxy-legend.svg',
  metrics: '/out/metrics.json',
  animationBytes: 1,
  variants: [
    {
      theme: 'dark',
      animation: '/out/galaxy.webp',
      poster: '/out/galaxy-poster.png',
      legend: '/out/galaxy-legend.svg',
      animationBytes: 1,
    },
  ],
};

describe('formatStepOutputs', () => {
  it('lists the directory and the publishable files', () => {
    expect(formatStepOutputs(result)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg\n',
    );
  });

  it('leaves out the legend when there is none', () => {
    const noLegend = {
      ...result,
      legend: undefined,
      variants: [{ ...result.variants[0]!, legend: undefined }],
    };
    expect(formatStepOutputs(noLegend)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png\n',
    );
  });

  it('never publishes the metrics snapshot', () => {
    expect(formatStepOutputs(result)).not.toContain('metrics.json');
  });

  it('lists every variant, dark first, so one publish keeps both sets', () => {
    const both: GenerateResult = {
      ...result,
      variants: [
        ...result.variants,
        {
          theme: 'light',
          animation: '/out/galaxy-light.webp',
          poster: '/out/galaxy-light-poster.png',
          legend: '/out/galaxy-light-legend.svg',
          animationBytes: 1,
        },
      ],
    };
    expect(formatStepOutputs(both)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg ' +
        'galaxy-light.webp galaxy-light-poster.png galaxy-light-legend.svg\n',
    );
  });
});

describe('formatStepOutputs with a card', () => {
  it('lists the card after the variants, so one publish keeps it', () => {
    expect(formatStepOutputs({ ...result, card: '/out/card.svg' })).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg card.svg\n',
    );
  });
});
