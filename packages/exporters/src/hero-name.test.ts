import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderHeroSvg } from './hero';

const base = createSampleMetrics();
const login = base.user.login.toUpperCase();
const hero = (name: string | null): string =>
  renderHeroSvg({ ...base, user: { ...base.user, name } });
const labelled = (svg: string, label: string): boolean => svg.includes(`aria-label="${label}"`);

describe('the name in the hero card', () => {
  it('is shown in capitals', () => {
    expect(labelled(hero('Shine Chikwapulo'), 'SHINE CHIKWAPULO')).toBe(true);
  });

  it('loses its accents instead of drawing question marks', () => {
    expect(labelled(hero('José Álvarez'), 'JOSE ALVAREZ')).toBe(true);
    expect(labelled(hero('Straße'), 'STRASSE')).toBe(true);
    expect(hero('José Álvarez')).not.toContain('aria-label="?');
  });

  it('keeps the Latin letters of a mixed name and drops the rest', () => {
    expect(labelled(hero('Ana 李'), 'ANA')).toBe(true);
    expect(labelled(hero('Alex 🚀 Smith'), 'ALEX SMITH')).toBe(true);
  });

  it('falls back to the login when no letter survives', () => {
    for (const name of ['李雷', 'Иван', '🚀', '---', '   ', '', null]) {
      expect(labelled(hero(name), login), String(name)).toBe(true);
    }
  });

  it('collapses extra spaces', () => {
    expect(labelled(hero('mary-jane   watson'), 'MARY-JANE WATSON')).toBe(true);
  });

  it('keeps initials, hyphens and apostrophes', () => {
    expect(labelled(hero('J. R. R. Tolkien'), 'J. R. R. TOLKIEN')).toBe(true);
    expect(labelled(hero("O'Brien"), 'O&apos;BRIEN')).toBe(true);
  });

  it('draws the first letter of each word larger', () => {
    const svg = hero('Shine Chikwapulo');
    expect((svg.match(/scale\(1\.\d+\)"\/>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('copes with a single letter, digits and very long names', () => {
    for (const name of [
      'J',
      'R2D2 Bot 3000',
      'A'.repeat(80),
      'Supercalifragilistic Hippopotomonstrosesquippedalio',
    ]) {
      const svg = hero(name);
      expect(svg.startsWith('<svg'), name).toBe(true);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
    }
  });

  it('shortens a very long name with an ellipsis', () => {
    expect(hero('A'.repeat(80))).toMatch(/aria-label="A+…"/);
  });
});
