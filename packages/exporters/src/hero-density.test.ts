import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { HERO_SLOT, renderHeroSvg } from './hero';

const metrics = createSampleMetrics();

describe('the hero character density', () => {
  it('draws frames made twice as large at the slot size', () => {
    const svg = renderHeroSvg(metrics, {
      character: {
        href: 'data:image/png;base64,AAAA',
        frameWidth: HERO_SLOT.width * 2,
        frameHeight: HERO_SLOT.height * 2,
        frames: 4,
        fps: 8,
        density: 2,
      },
    });
    expect(svg).toContain(`width="${HERO_SLOT.width * 4}" height="${HERO_SLOT.height}"`);
    expect(svg).toContain(`50.000%{transform:translateX(${-3 * HERO_SLOT.width}px)}`);
  });

  it('copes with a density that does not divide evenly', () => {
    const svg = renderHeroSvg(metrics, {
      character: {
        href: 'data:image/png;base64,AAAA',
        frameWidth: 570,
        frameHeight: 750,
        frames: 24,
        density: 1.5,
      },
    });
    expect(svg).toContain('width="9120" height="500"');
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('NaN');
  });

  it('draws frames at their pixel size when there is no density', () => {
    const svg = renderHeroSvg(metrics, {
      character: {
        href: 'data:image/png;base64,AAAA',
        frameWidth: HERO_SLOT.width,
        frameHeight: HERO_SLOT.height,
        frames: 4,
      },
    });
    expect(svg).toContain(`width="${HERO_SLOT.width * 4}" height="${HERO_SLOT.height}"`);
  });
});
