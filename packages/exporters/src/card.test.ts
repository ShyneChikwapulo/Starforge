import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { fitName, renderCardSvg } from './card';
import { measureCardText } from './card-text';

const sample = createSampleMetrics();

const withUser = (patch: Partial<Metrics['user']>): Metrics => ({
  ...sample,
  user: { ...sample.user, ...patch },
});

const withStats = (stats: Metrics['pullRequestStats']): Metrics => ({
  ...sample,
  pullRequestStats: stats,
});

describe('renderCardSvg', () => {
  it('is a titled SVG with the card shape', () => {
    const svg = renderCardSvg(sample);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 800 500"');
    expect(svg).toContain('width="800" height="500"');
    expect(svg).toContain(`<title id="card-title">GitHub profile card for ${sample.user.login}`);
  });

  it('keeps its shape at another width', () => {
    expect(renderCardSvg(sample, { width: 400 })).toContain('width="400" height="250"');
  });

  it('is deterministic', () => {
    expect(renderCardSvg(sample)).toBe(renderCardSvg(sample));
  });

  it('draws every letter as an outline, with no text elements or fonts', () => {
    const svg = renderCardSvg(sample);
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('font-family');
    expect(svg.match(/<use /g)!.length).toBeGreaterThan(50);
  });

  it('defines exactly the glyphs it uses', () => {
    const svg = renderCardSvg(sample);
    const used = new Set([...svg.matchAll(/<use href="#(g\d+)"/g)].map((m) => m[1]));
    const defined = new Set([...svg.matchAll(/<path id="(g\d+)"/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(10);
    expect(defined).toEqual(used);
  });

  it('shows the headline numbers with thousands separators', () => {
    const svg = renderCardSvg({ ...sample, totals: { ...sample.totals, stars: 12345 } });
    expect(svg).toContain('aria-label="12,345"');
  });

  it('escapes anything a person can type into their profile', () => {
    const svg = renderCardSvg(withUser({ name: '<b>&"x' }));
    expect(svg).toContain('aria-label="&lt;B&gt;&amp;&quot;X"');
    expect(svg).not.toContain('<b>');
  });

  it('shortens a long name with an ellipsis', () => {
    const svg = renderCardSvg(withUser({ name: 'A'.repeat(40) }));
    expect(svg).toContain('…"');
    expect(svg).not.toContain('A'.repeat(30));
  });

  it('shows a dash instead of pull request numbers it does not have', () => {
    const svg = renderCardSvg(withStats(null));
    expect(svg).toContain('aria-label="—"');
    expect(svg).toContain('aria-label="NO PR DATA"');
    expect(svg).not.toContain('class="sweep"');
  });

  it('sets the dial from the merge rate', () => {
    const svg = renderCardSvg(withStats({ opened: 10, merged: 5, mergedAllTime: 7 }));
    const circumference = 2 * Math.PI * 34;
    expect(svg).toContain('aria-label="50%"');
    expect(svg).toContain(`stroke-dashoffset="${(circumference * 0.5).toFixed(2)}"`);
    expect(svg).toContain('class="sweep"');
  });

  it('draws one row per language, at most five', () => {
    const rows = (metrics: Metrics): number =>
      (renderCardSvg(metrics).match(/class="lang-row"/g) ?? []).length;
    expect(rows(sample)).toBe(Math.min(5, sample.languages.length));
    expect(rows({ ...sample, languages: sample.languages.slice(0, 2) })).toBe(2);
    expect(rows({ ...sample, languages: [] })).toBe(0);
  });

  it('reports the current streak', () => {
    const calendar = sample.contributions.calendar.map((day, i, all) => ({
      ...day,
      count: i >= all.length - 3 ? 1 : 0,
    }));
    const svg = renderCardSvg({ ...sample, contributions: { ...sample.contributions, calendar } });
    expect(svg).toContain('aria-label="3"');
    expect(svg).toContain('aria-label="LONGEST 3 DAYS"');
  });

  it('copes with no activity and no repositories', () => {
    const quiet: Metrics = {
      ...sample,
      languages: [],
      repositories: [],
      highlights: null,
      pullRequestStats: null,
      contributions: { ...sample.contributions, calendar: [] },
    };
    const svg = renderCardSvg(quiet);
    expect(svg).toContain('aria-label="NO LANGUAGE DATA"');
    expect(svg).not.toContain('NaN');
  });

  it('writes one star and one follower in the singular', () => {
    const svg = renderCardSvg({
      ...withUser({ followers: 1 }),
      highlights: null,
      repositories: [{ ...sample.repositories[0]!, stars: 1 }],
    });
    expect(svg).toContain('aria-label="1 STAR"');
    expect(svg).toContain('aria-label="1 FOLLOWER"');
  });
});

describe('fitName', () => {
  it('draws a short name at full size', () => {
    expect(fitName('SHINE', 400).size).toBe(38);
  });

  it('shrinks a longer name so it fits the room it has', () => {
    const { text, size } = fitName('SHINE CHIKWAPULO', 330);
    expect(size).toBeLessThan(38);
    expect(measureCardText(text, size, 3)).toBeLessThanOrEqual(330);
  });

  it('never gets smaller with a longer name', () => {
    let previous = Infinity;
    for (let length = 1; length <= 30; length++) {
      const { size } = fitName('N'.repeat(length), 330);
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
  });

  it('cuts a very long name short, and still fits', () => {
    const { text, size } = fitName('N'.repeat(60), 330);
    expect(text.endsWith('…')).toBe(true);
    expect(size).toBeGreaterThanOrEqual(20);
    expect(measureCardText(text, size, 3)).toBeLessThanOrEqual(330);
  });
});
