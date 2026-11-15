import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderFooterSvg, renderSectionSvg } from './page-pieces';

const metrics = createSampleMetrics();
const heightOf = (svg: string): number => Number(/viewBox="0 0 1200 (\d+)"/.exec(svg)![1]);

describe('renderSectionSvg', () => {
  it('is a standalone SVG whose height is a multiple of 60', () => {
    const svg = renderSectionSvg('Presets', { subtitle: 'Five ways' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(heightOf(svg) % 60).toBe(0);
    expect(svg).not.toContain('<text');
  });

  it('draws its title and subtitle in capitals', () => {
    const svg = renderSectionSvg('Presets', { subtitle: 'Five ways' });
    expect(svg).toContain('aria-label="PRESETS"');
    expect(svg).toContain('aria-label="FIVE WAYS"');
  });

  it('keeps to characters the font has', () => {
    expect(renderSectionSvg('Café ✓')).toContain('aria-label="CAFE "');
  });

  it('scales to a requested width', () => {
    expect(renderSectionSvg('Presets', { width: 600 })).toContain('width="600" height="60"');
  });
});

describe('renderFooterSvg', () => {
  it('is a standalone SVG whose height is a multiple of 60', () => {
    const svg = renderFooterSvg(metrics);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(heightOf(svg) % 60).toBe(0);
    expect(svg).not.toContain('<text');
  });

  it('closes the stack with a bottom cap', () => {
    expect(renderFooterSvg(metrics)).toContain('class="rail-pulse"');
  });

  it('names the project, the user and the sync date', () => {
    const svg = renderFooterSvg(metrics);
    expect(svg).toContain('aria-label="STARFORGE"');
    expect(svg).toContain(
      `aria-label="@${metrics.user.login.toUpperCase()} · SYNC ${metrics.generatedAt.slice(0, 10)}"`,
    );
  });

  it('is deterministic', () => {
    expect(renderFooterSvg(metrics)).toBe(renderFooterSvg(metrics));
  });
});
