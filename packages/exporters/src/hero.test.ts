import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { HERO_SLOT, renderHeroSvg } from './hero';

const metrics = createSampleMetrics();

describe('renderHeroSvg', () => {
  it('is a standalone 4:3 SVG', () => {
    const svg = renderHeroSvg(metrics);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 1200 900"');
    expect(svg).toContain('width="1200" height="900"');
  });

  it('scales to a requested width and keeps the shape', () => {
    expect(renderHeroSvg(metrics, { width: 600 })).toContain('width="600" height="450"');
  });

  it('names the user in its title', () => {
    expect(renderHeroSvg(metrics)).toContain(metrics.user.login);
  });

  it('draws text as outlines, not as <text>', () => {
    expect(renderHeroSvg(metrics)).not.toContain('<text');
  });

  it('references nothing outside itself', () => {
    expect(renderHeroSvg(metrics)).not.toMatch(/(?:href|src)="https?:/);
  });

  it('is deterministic', () => {
    expect(renderHeroSvg(metrics)).toBe(renderHeroSvg(metrics));
  });

  it('draws no character, and no animation for one, without a character', () => {
    const svg = renderHeroSvg(metrics);
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('@keyframes char');
  });

  it('embeds the strip and steps through it with CSS, forwards then back', () => {
    const svg = renderHeroSvg(metrics, {
      character: {
        href: 'data:image/png;base64,AAAA',
        frameWidth: HERO_SLOT.width,
        frameHeight: HERO_SLOT.height,
        frames: 4,
        fps: 8,
      },
    });
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).toContain(`width="${HERO_SLOT.width * 4}"`);
    // Frames 0 1 2 3 2 1 is six steps, which at 8 fps is 0.75 seconds.
    expect(svg).toContain('char 0.750s step-end infinite');
    expect(svg).toContain(`50.000%{transform:translateX(${-3 * HERO_SLOT.width}px)}`);
  });

  it('follows a custom frame sequence', () => {
    const svg = renderHeroSvg(metrics, {
      character: {
        href: 'data:image/png;base64,AAAA',
        frameWidth: 10,
        frameHeight: 10,
        frames: 2,
        fps: 1,
        sequence: [0, 0, 1],
      },
    });
    expect(svg).toContain('char 3.000s step-end infinite');
  });

  it('escapes a name that looks like markup', () => {
    const svg = renderHeroSvg({ ...metrics, user: { ...metrics.user, name: 'A<B>&"' } });
    expect(svg).not.toContain('A<B>');
  });

  it('shows no NaN when there is no pull request data', () => {
    const svg = renderHeroSvg({ ...metrics, pullRequestStats: null });
    expect(svg).not.toContain('NaN');
  });

  it('says so when there are no languages', () => {
    const svg = renderHeroSvg({ ...metrics, languages: [] });
    expect(svg).toContain('aria-label="NO LANGUAGE DATA"');
  });
});
