import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderInfoCardSvg } from './info-card';
import { mergeRate } from './info-opensource';

const base = createSampleMetrics();
const render = (metrics: Metrics): string => renderInfoCardSvg(metrics, { card: 'opensource' });
const labels = (svg: string): string =>
  [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');

const repo = (name: string, stars: number) => ({
  nameWithOwner: name,
  url: `https://github.com/${name}`,
  stars,
  mergedPullRequests: 1,
});
const withRepos = (repositories: ReturnType<typeof repo>[], merged = 20): Metrics => ({
  ...base,
  highlights: { pinned: [], notable: { mergedPullRequests: merged, repositories } },
});
const withStats = (opened: number, merged: number, mergedAllTime: number): Metrics => ({
  ...base,
  pullRequestStats: { opened, merged, mergedAllTime },
});

describe('mergeRate', () => {
  it('is merged over opened, and null when nothing was opened', () => {
    expect(mergeRate({ opened: 0, merged: 0 })).toBeNull();
    expect(mergeRate({ opened: 4, merged: 3 })).toBe(0.75);
    expect(mergeRate({ opened: 2, merged: 5 })).toBe(1);
  });
});

describe('the open source card', () => {
  it('says exactly where its numbers come from, and fits its whole legend', () => {
    const text = labels(render(base));
    expect(text).toContain('PULL REQUESTS YOU OPENED IN THE LAST 12 MONTHS');
    expect(text).toContain('MERGE RATE IS MERGED OVER OPENED');
    expect(text).toContain('OPEN ONES COUNT AGAINST IT');
    expect(text).toContain('REPOSITORIES YOU DO NOT OWN, MOST STARS FIRST (BARS: LOG SCALE)');
    expect(text).toContain('FROM YOUR 100 MOST RECENTLY UPDATED MERGED PULL REQUESTS');
    expect(text).toContain('AS YOUR PROFILE SHOWS THEM');
  });

  it('shows the merge rate in a chip and the all-time count', () => {
    const svg = render(withStats(200, 150, 900));
    expect(svg).toContain('aria-label="75% MERGE RATE"');
    expect(svg).toContain('aria-label="900 MERGED ALL TIME"');
    expect(svg).toContain('aria-label="75%"');
  });

  it('shows 0% rather than <1% when nothing was merged', () => {
    const svg = render(withStats(40, 0, 3));
    expect(svg).toContain('aria-label="0% MERGE RATE"');
    expect(svg).not.toContain('<1%');
  });

  it('shows a dash and no rate chip when nothing was opened', () => {
    const svg = render(withStats(0, 0, 5));
    expect(svg).toContain('aria-label="—"');
    expect(svg).not.toMatch(/aria-label="[^"]*% MERGE RATE"/);
    expect(svg).not.toContain('NaN');
  });

  it('says so when the pull request numbers were not collected', () => {
    const svg = render({ ...base, pullRequestStats: null });
    expect(svg).toContain('aria-label="NO PR DATA"');
    expect(svg).not.toContain('MERGED ALL TIME');
    expect(svg).not.toContain('NaN');
  });

  it('lists six repositories at most, the most starred first', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      repo(`org/repo-${i + 1}`, Math.floor(10_000 / (i + 1) ** 2)),
    );
    const svg = render(withRepos(many));
    for (let i = 1; i <= 6; i++) expect(svg).toContain(`aria-label="ORG/REPO-${i}"`);
    expect(svg).not.toContain('aria-label="ORG/REPO-7"');
  });

  it('says so when there is no list to show', () => {
    expect(labels(render(withRepos([])))).toContain(
      'NO MERGED PULL REQUESTS INTO OTHER PROJECTS YET',
    );
    expect(render({ ...base, highlights: null })).toContain('aria-label="NOT COLLECTED"');
  });

  it('cuts a very long repository name so that it fits', () => {
    const long = `${'x'.repeat(60)}/${'y'.repeat(60)}`;
    const svg = render(withRepos([repo(long, 1200)]));
    expect(svg).toMatch(/aria-label="[^"]*…"/);
    expect(svg).not.toContain('NaN');
  });

  it('copes with repositories that have no stars, and with huge numbers', () => {
    const none = render(withRepos([repo('a/b', 0), repo('c/d', 0)]));
    expect(none).not.toContain('NaN');
    expect(none).toContain('aria-label="0 STARS"');
    const huge = render({
      ...withRepos([repo('a/b', 250_000)], 1_000_000),
      pullRequestStats: { opened: 12_345_678, merged: 9_876_543, mergedAllTime: 99_999_999 },
    });
    expect(huge).not.toContain('NaN');
    expect(huge).toContain('aria-label="12,345,678"');
  });
});
