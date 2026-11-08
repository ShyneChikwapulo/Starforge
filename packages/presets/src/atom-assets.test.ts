import { describe, expect, it } from 'vitest';
import { getKitten, getLanguageIcon, ICON_SIZE } from './atom-assets';

describe('getKitten', () => {
  it('decodes evenly spread points inside a box one across', () => {
    const { points, stars } = getKitten();
    expect(points.length / 3).toBeGreaterThan(5000);
    expect(stars).toBeGreaterThan(100);
    for (const value of points) expect(Math.abs(value)).toBeLessThanOrEqual(0.55);
  });

  it('links only stars', () => {
    const { links, stars } = getKitten();
    expect(links.length % 2).toBe(0);
    expect(links.length).toBeGreaterThan(0);
    for (const index of links) expect(index).toBeLessThan(stars);
  });
});

describe('getLanguageIcon', () => {
  it('has a full-colour icon for common languages', () => {
    const python = getLanguageIcon('Python')!;
    expect(python.palette).toHaveLength(15);
    expect(python.pixels).toHaveLength(ICON_SIZE * ICON_SIZE);
    expect(Math.max(...python.pixels)).toBeLessThanOrEqual(15);
    expect(python.pixels.some((index) => index > 0)).toBe(true);
  });

  it('has none for unknown names, and ignores inherited properties', () => {
    expect(getLanguageIcon('No Such Language')).toBeUndefined();
    expect(getLanguageIcon('constructor')).toBeUndefined();
  });
});
