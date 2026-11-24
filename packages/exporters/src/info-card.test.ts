import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { INFO_CARD_IDS, renderInfoCardSvg } from './info-card';
import { createDefaultSkin } from './skin';

const base = createSampleMetrics();
/** All the aria-labels of a card read as one text, so a wrapped sentence is still one sentence. */
const legendText = (svg: string): string =>
  [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');
const heightOf = (svg: string): number => Number(/viewBox="0 0 1200 (\d+)"/.exec(svg)![1]);

const manyLanguages = (count: number): Metrics => {
  const languages = Array.from({ length: count }, (_, i) => ({
    name: `Language ${i + 1}`,
    color: i % 3 === 0 ? null : `#${((i * 2654435) % 0xffffff).toString(16).padStart(6, '0')}`,
    bytes: Math.round(1_000_000 / (i + 1) ** 2),
    repoCount: i + 1,
    share: 0,
  }));
  const total = languages.reduce((sum, l) => sum + l.bytes, 0);
  return { ...base, languages: languages.map((l) => ({ ...l, share: l.bytes / total })) };
};

const day = (date: string, count: number) => ({ date, count });
const NEON = ['#fcee09', 'class="pulse"', 'url(#glow)', 'url(#glowTR)'];

const VARIANTS: [string, Metrics][] = [
  ['the sample', base],
  ['no languages', { ...base, languages: [] }],
  ['one language', manyLanguages(1)],
  ['five languages', manyLanguages(5)],
  ['thirty languages', manyLanguages(30)],
  ['no activity at all', { ...base, contributions: { ...base.contributions, calendar: [] } }],
  [
    'ten days of activity',
    {
      ...base,
      contributions: {
        ...base.contributions,
        calendar: Array.from({ length: 10 }, (_, i) =>
          day(`2026-03-${String(i + 1).padStart(2, '0')}`, i),
        ),
      },
    },
  ],
  [
    'a quiet year',
    {
      ...base,
      contributions: {
        ...base.contributions,
        calendar: base.contributions.calendar.map((d) => day(d.date, 0)),
      },
    },
  ],
];

describe.each(INFO_CARD_IDS)('the %s card', (card) => {
  it.each(VARIANTS)('draws a clean standalone SVG for %s', (_label, metrics) => {
    const svg = renderInfoCardSvg(metrics, { card });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('<text');
    expect(heightOf(svg) % 60).toBe(0);
  });

  it('is deterministic', () => {
    expect(renderInfoCardSvg(base, { card })).toBe(renderInfoCardSvg(base, { card }));
  });

  it('draws in the default skin with none of the neon marks', () => {
    const svg = renderInfoCardSvg(base, { card, skin: 'default' });
    for (const mark of NEON) expect(svg, mark).not.toContain(mark);
  });

  it('takes its background from the skin it is handed', () => {
    const calm = createDefaultSkin();
    const custom = { ...calm, colors: { ...calm.colors, bg: '#001122' } };
    const svg = renderInfoCardSvg(base, { card, skin: custom });
    expect(svg).toContain('#001122');
    expect(svg).not.toContain('#0d1117');
  });

  it('swaps its closed frame for the page chrome when stacked, keeping its height', () => {
    const alone = renderInfoCardSvg(base, { card });
    const stacked = renderInfoCardSvg(base, { card, stack: 'none' });
    expect(stacked).toContain('id="edgeL"');
    expect(alone).not.toContain('id="edgeL"');
    expect(heightOf(stacked)).toBe(heightOf(alone));
  });

  it('scales to a requested width', () => {
    expect(renderInfoCardSvg(base, { card, width: 600 })).toContain('width="600"');
  });

  it('names its owner and its date in the label and the footer', () => {
    const svg = renderInfoCardSvg(base, { card });
    expect(svg).toContain(base.user.login);
    expect(svg).toContain(`aria-label="SYNC ${base.generatedAt.slice(0, 10)}"`);
  });

  it('refuses a card it does not know', () => {
    expect(() => renderInfoCardSvg(base, { card: 'nope' as never })).toThrow(/Unknown info card/);
  });
});

describe('the languages card', () => {
  it('says exactly where its numbers come from', () => {
    const svg = renderInfoCardSvg(base, { card: 'languages' });
    expect(legendText(svg)).toContain('PUBLIC REPOSITORIES THAT ARE NOT FORKS');
    expect(legendText(svg)).toContain('ARCHIVED REPOSITORIES ARE INCLUDED');
    expect(legendText(svg)).toContain('UP TO YOUR 500 MOST STARRED REPOSITORIES ARE READ');
    expect(legendText(svg)).toContain('THE 10 LARGEST LANGUAGES OF EACH');
  });

  it('shows the biggest ten and says how many more there are', () => {
    const svg = renderInfoCardSvg(manyLanguages(30), { card: 'languages' });
    expect(svg).toContain('aria-label="+20 MORE');
    expect(legendText(svg)).toContain('LARGEST 10 OF 30');
    expect(svg).not.toContain('aria-label="LANGUAGE 11"');
  });

  it('says so when there is nothing to show', () => {
    expect(renderInfoCardSvg({ ...base, languages: [] }, { card: 'languages' })).toContain(
      'aria-label="NO LANGUAGE DATA"',
    );
  });

  it('uses one wide column for five languages or fewer, and two for more', () => {
    const wide = renderInfoCardSvg(manyLanguages(5), { card: 'languages' });
    const split = renderInfoCardSvg(manyLanguages(8), { card: 'languages' });
    expect(heightOf(split)).toBeLessThanOrEqual(heightOf(wide) + 60);
  });

  it('survives language names with symbols and no colour', () => {
    const odd: Metrics = {
      ...base,
      languages: [
        { name: 'C++', color: null, bytes: 500, repoCount: 1, share: 0.5 },
        { name: 'F*', color: '#fa0000', bytes: 300, repoCount: 1, share: 0.3 },
        {
          name: 'Jupyter Notebook and a very long name indeed',
          color: null,
          bytes: 200,
          repoCount: 1,
          share: 0.2,
        },
      ],
    };
    const svg = renderInfoCardSvg(odd, { card: 'languages' });
    expect(svg).toContain('aria-label="C++"');
    expect(svg).not.toContain('NaN');
  });
});

describe('the heatmap card', () => {
  it('says what it counts', () => {
    expect(legendText(renderInfoCardSvg(base, { card: 'heatmap' }))).toContain(
      'QUARTILES OF YOUR BUSY DAYS',
    );
  });

  it('says so when there is no activity data', () => {
    const svg = renderInfoCardSvg(
      { ...base, contributions: { ...base.contributions, calendar: [] } },
      { card: 'heatmap' },
    );
    expect(svg).toContain('aria-label="NO ACTIVITY DATA"');
  });

  it('draws at most five paths of squares', () => {
    const svg = renderInfoCardSvg(base, { card: 'heatmap' });
    const squares = (svg.match(/<path d="M[\d.]+ [\d.]+h/g) ?? []).length;
    expect(squares).toBeGreaterThan(0);
    expect(squares).toBeLessThanOrEqual(5);
  });
});
