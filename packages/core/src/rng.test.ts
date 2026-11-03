import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

function take(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng());
}

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    expect(take(42, 10)).toEqual(take(42, 10));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it('stays within [0, 1)', () => {
    for (const value of take(7, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
