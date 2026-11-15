import { describe, expect, it } from 'vitest';
import type { GenerateResult, GeneratedPreset, GeneratedVariant } from './generate';
import { formatStepOutputs } from './outputs';

const variant = (name: string, theme: GeneratedVariant['theme'] = 'dark'): GeneratedVariant => ({
  theme,
  animation: `/out/${name}.webp`,
  poster: `/out/${name}-poster.png`,
  legend: `/out/${name}-legend.svg`,
  animationBytes: 1,
});

const resultFor = (presets: GeneratedPreset[]): GenerateResult => {
  const first = presets[0]!;
  const firstVariant = first.variants[0]!;
  return {
    directory: '/out',
    animation: firstVariant.animation,
    poster: firstVariant.poster,
    legend: firstVariant.legend,
    metrics: '/out/metrics.json',
    presetCard: first.presetCard,
    animationBytes: 1,
    variants: first.variants,
    presets,
  };
};

const result = resultFor([{ id: 'galaxy', variants: [variant('galaxy')] }]);

describe('formatStepOutputs', () => {
  it('lists the directory and the publishable files', () => {
    expect(formatStepOutputs(result)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg\n',
    );
  });

  it('leaves out the legend when there is none', () => {
    const noLegend = resultFor([
      { id: 'galaxy', variants: [{ ...variant('galaxy'), legend: undefined }] },
    ]);
    expect(formatStepOutputs(noLegend)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png\n',
    );
  });

  it('never publishes the metrics snapshot', () => {
    expect(formatStepOutputs(result)).not.toContain('metrics.json');
  });

  it('lists every variant, dark first, so one publish keeps both sets', () => {
    const both = resultFor([
      { id: 'galaxy', variants: [variant('galaxy'), variant('galaxy-light', 'light')] },
    ]);
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

describe('formatStepOutputs with several presets', () => {
  const several = resultFor([
    { id: 'galaxy', variants: [variant('galaxy')], presetCard: '/out/galaxy-card.svg' },
    { id: 'tree', variants: [variant('tree')], presetCard: '/out/tree-card.svg' },
  ]);

  it('lists every preset, so one publish keeps them all', () => {
    expect(formatStepOutputs(several)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg ' +
        'tree.webp tree-poster.png tree-legend.svg galaxy-card.svg tree-card.svg\n',
    );
  });

  it('puts the shared pieces around the preset cards in page order', () => {
    const page = {
      ...several,
      card: '/out/card.svg',
      hero: '/out/hero.svg',
      divider: '/out/divider.svg',
      footer: '/out/footer.svg',
    };
    expect(formatStepOutputs(page)).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png galaxy-legend.svg ' +
        'tree.webp tree-poster.png tree-legend.svg card.svg hero.svg galaxy-card.svg tree-card.svg ' +
        'divider.svg footer.svg\n',
    );
  });
});
