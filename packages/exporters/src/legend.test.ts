import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderLegendSvg } from './legend';

const sample = createSampleMetrics();

function withLanguages(names: string[], color: string | null = '#ff0000'): Metrics {
  const share = 1 / names.length;
  return {
    ...sample,
    languages: names.map((name) => ({ name, color, bytes: 1000, repoCount: 1, share })),
  };
}

describe('renderLegendSvg', () => {
  it('is an SVG that names the user, the numbers and the languages', () => {
    const svg = renderLegendSvg(sample);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('@sample-user');
    expect(svg).toContain('commits');
    for (const language of sample.languages.slice(0, 5)) expect(svg).toContain(language.name);
    expect(svg).toContain('%');
  });

  it('escapes anything that could break out of the markup', () => {
    const svg = renderLegendSvg(withLanguages(['<b>&"x']));
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;&amp;&quot;x');
  });

  it('draws at most as many swatches as the galaxy has arms', () => {
    const svg = renderLegendSvg(withLanguages(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
    expect(svg.match(/<circle/g)).toHaveLength(6);
  });

  it('falls back to grey for a missing or invalid language colour', () => {
    expect(renderLegendSvg(withLanguages(['A'], null))).toContain('fill="#8b949e"/>');
    expect(renderLegendSvg(withLanguages(['A'], 'red; evil'))).not.toContain('red; evil');
  });

  it('says so when there is no language data', () => {
    expect(renderLegendSvg({ ...sample, languages: [] })).toContain('No language data yet');
  });

  it('uses singular nouns for a count of one', () => {
    const svg = renderLegendSvg({ ...sample, totals: { ...sample.totals, stars: 1 } });
    expect(svg).toContain('1 star');
    expect(svg).not.toContain('1 stars');
  });

  it('keeps a single row when the chips fit', () => {
    expect(renderLegendSvg(sample)).toContain('height="132"');
  });

  it('wraps to a second row instead of overflowing', () => {
    const names = Array.from({ length: 6 }, (_, i) => `ABCDEFGHIJ${i}`);
    expect(renderLegendSvg(withLanguages(names))).toContain('height="156"');
  });

  it('uses a custom caption and escapes it', () => {
    const svg = renderLegendSvg(sample, { caption: 'Stripes <are> languages' });
    expect(svg).toContain('Stripes &lt;are&gt; languages');
    expect(svg).not.toContain('Arms:');
  });

  it('is deterministic', () => {
    expect(renderLegendSvg(sample)).toBe(renderLegendSvg(sample));
  });
});
