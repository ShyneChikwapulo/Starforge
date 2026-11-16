import { describe, expect, it } from 'vitest';
import type { GenerateResult, GeneratedPreset, GeneratedVariant } from './generate';
import { formatStepOutputs, publishedPaths } from './outputs';

const variant = (name: string): GeneratedVariant => ({
  theme: 'dark',
  animation: `/out/${name}.webp`,
  poster: `/out/${name}-poster.png`,
  legend: undefined,
  animationBytes: 1,
});

const resultFor = (presets: GeneratedPreset[]): GenerateResult => {
  const first = presets[0]!;
  const firstVariant = first.variants[0]!;
  return {
    directory: '/out',
    animation: firstVariant.animation,
    poster: firstVariant.poster,
    animationBytes: 1,
    variants: first.variants,
    presets,
  };
};

const result = {
  ...resultFor([
    { id: 'galaxy', variants: [variant('galaxy')], presetCard: '/out/galaxy-card.svg' },
    { id: 'tree', variants: [variant('tree')], presetCard: '/out/tree-card.svg' },
  ]),
  hero: '/out/hero.svg',
  footer: '/out/footer.svg',
};

describe('publishedPaths', () => {
  it('lists full paths in publishing order', () => {
    expect(publishedPaths(result)).toEqual([
      '/out/galaxy.webp',
      '/out/galaxy-poster.png',
      '/out/tree.webp',
      '/out/tree-poster.png',
      '/out/hero.svg',
      '/out/galaxy-card.svg',
      '/out/tree-card.svg',
      '/out/footer.svg',
    ]);
  });
});

describe('formatStepOutputs with a version', () => {
  it('adds a version line after the file list', () => {
    expect(formatStepOutputs(result, 'abc1234567')).toBe(
      'directory=/out\nfiles=galaxy.webp galaxy-poster.png tree.webp tree-poster.png hero.svg ' +
        'galaxy-card.svg tree-card.svg footer.svg\nversion=abc1234567\n',
    );
  });

  it('leaves the version line out when there is none', () => {
    expect(formatStepOutputs(result)).not.toContain('version=');
  });
});
