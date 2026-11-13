import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderCardSvg } from './card';

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

  it('shows the headline numbers with thousands separators', () => {
    const svg = renderCardSvg({ ...sample, totals: { ...sample.totals, stars: 12345 } });
    expect(svg).toContain('12,345');
  });

  it('escapes anything a person can type into their profile', () => {
    const svg = renderCardSvg(withUser({ name: '<b>&"x' }));
    expect(svg).toContain('&lt;B&gt;&amp;&quot;X');
    expect(svg).not.toContain('<b>');
  });

  it('shortens a long name with an ellipsis', () => {
    const svg = renderCardSvg(withUser({ name: 'A'.repeat(40) }));
    expect(svg).toContain('…');
    expect(svg).not.toContain('A'.repeat(20));
  });

  it('shows a dash instead of pull request numbers it does not have', () => {
    const svg = renderCardSvg(withStats(null));
    expect(svg).toContain('>—<');
    expect(svg).toContain('NO PR DATA');
    expect(svg).not.toContain('class="sweep"');
  });

  it('sets the dial from the merge rate', () => {
    const svg = renderCardSvg(withStats({ opened: 10, merged: 5, mergedAllTime: 7 }));
    const circumference = 2 * Math.PI * 38;
    expect(svg).toContain('50%');
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
    expect(svg).toMatch(/>3<tspan/);
    expect(svg).toContain('LONGEST 3 DAYS');
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
    expect(svg).toContain('NO LANGUAGE DATA');
    expect(svg).not.toContain('NaN');
  });
});
