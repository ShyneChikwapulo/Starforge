import { describe, expect, it } from 'vitest';
import { hashString, hexToRgb, logScale, rootWeights, scaleColor } from './scale';

describe('logScale', () => {
  it('maps zero to zero and the maximum to one', () => {
    expect(logScale(0, 100, 20)).toBe(0);
    expect(logScale(100, 100, 20)).toBe(1);
  });

  it('keeps small profiles modest', () => {
    const small = logScale(1, 1, 20);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(0.3);
  });

  it('is monotonic and never exceeds one', () => {
    expect(logScale(10, 100, 20)).toBeLessThan(logScale(50, 100, 20));
    expect(logScale(1000, 100, 20)).toBe(1);
  });
});

describe('hexToRgb', () => {
  it('parses valid colours', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0]);
  });

  it('falls back for missing or invalid input', () => {
    expect(hexToRgb(null)).toEqual(hexToRgb('#8b949e'));
    expect(hexToRgb('nope')).toEqual(hexToRgb('#8b949e'));
  });
});

describe('helpers', () => {
  it('scales colours', () => {
    expect(scaleColor([1, 0.5, 0], 0.5)).toEqual([0.5, 0.25, 0]);
  });

  it('hashes strings stably', () => {
    expect(hashString('starforge')).toBe(hashString('starforge'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('rootWeights', () => {
  it('compresses the range and sums to 1', () => {
    const [major, minor] = rootWeights([0.81, 0.09]);
    expect(major).toBeCloseTo(0.75);
    expect(minor).toBeCloseTo(0.25);
  });

  it('falls back to equal weights when every value is zero', () => {
    expect(rootWeights([0, 0])).toEqual([0.5, 0.5]);
  });

  it('handles an empty list', () => {
    expect(rootWeights([])).toEqual([]);
  });
});
