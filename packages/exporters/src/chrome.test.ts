import { describe, expect, it } from 'vitest';
import { STEP, chromeLayer } from './chrome';

const rungs = (svg: string): number[] =>
  [...svg.matchAll(/<rect x="14" y="(\d+)" width="14"/g)].map((match) => Number(match[1]));

describe('chromeLayer', () => {
  it('puts a rung every STEP units', () => {
    expect(rungs(chromeLayer(1200, 600, 'none'))).toEqual(
      Array.from({ length: 10 }, (_, i) => i * STEP),
    );
  });

  it('draws the same rungs however tall the piece is, so pieces join without a seam', () => {
    const short = rungs(chromeLayer(1200, 600, 'none'));
    const tall = rungs(chromeLayer(1200, 1200, 'none'));
    expect(tall.slice(0, short.length)).toEqual(short);
  });

  it('runs the rails the full height without caps', () => {
    expect(chromeLayer(1200, 600, 'none')).toContain('M14,0 V600 M1186,0 V600');
  });

  it('starts the rails below a top cap and stops them above a bottom cap', () => {
    expect(chromeLayer(1200, 600, 'top')).toContain('M14,58 V600');
    expect(chromeLayer(1200, 600, 'bottom')).toContain('M14,0 V542');
  });

  it('has a pulsing bar only where there is a cap', () => {
    expect(chromeLayer(1200, 600, 'none')).not.toContain('class="rail-pulse"');
    expect(chromeLayer(1200, 600, 'top')).toContain('class="rail-pulse"');
    expect(chromeLayer(1200, 600, 'bottom')).toContain('class="rail-pulse"');
  });

  it('is deterministic', () => {
    expect(chromeLayer(1200, 900, 'both')).toBe(chromeLayer(1200, 900, 'both'));
  });
});
