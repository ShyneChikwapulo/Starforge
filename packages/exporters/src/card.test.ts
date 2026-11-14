import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { fitName, renderCardSvg } from './card';

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
    expect(svg).not.toContain('A'.repeat(30));
  });

  it('shows a dash instead of pull request numbers it does not have', () => {
    const svg = renderCardSvg(withStats(null));
    expect(svg).toContain('>—<');
    expect(svg).toContain('NO PR DATA');
    expect(svg).not.toContain('class="sweep"');
  });

  it('sets the dial from the merge rate', () => {
    const svg = renderCardSvg(withStats({ opened: 10, merged: 5, mergedAllTime: 7 }));
    const circumference = 2 * Math.PI * 34;
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

describe('fitName', () => {
  it('draws a short name at full size', () => {
    expect(fitName('SHINE', 400).size).toBe(38);
  });

  it('shrinks a longer name so it fits the room it has', () => {
    const { text, size } = fitName('SHINE CHIKWAPULO', 400);
    expect(size).toBeLessThan(38);
    expect(text.length * (0.62 * size + 3)).toBeLessThanOrEqual(400);
  });

  it('never gets smaller with a longer name', () => {
    let previous = Infinity;
    for (let length = 1; length <= 30; length++) {
      const { size } = fitName('N'.repeat(length), 400);
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
  });

  it('cuts a very long name short, and keeps a readable size', () => {
    const { text, size } = fitName('N'.repeat(60), 400);
    expect(text.endsWith('…')).toBe(true);
    expect(size).toBeGreaterThanOrEqual(20);
  });
});

describe('renderCardSvg wording', () => {
  it('writes one star in the singular', () => {
    const svg = renderCardSvg({
      ...sample,
      highlights: null,
      repositories: [{ ...sample.repositories[0]!, stars: 1 }],
    });
    expect(svg).toContain('1 STAR</text>');
    expect(svg).not.toContain('1 STARS');
  });

  it('writes one follower in the singular', () => {
    expect(renderCardSvg(withUser({ followers: 1 }))).toContain('1 FOLLOWER<');
  });
});
