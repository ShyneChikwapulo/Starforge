import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { computeStreaks, mergeRate } from './derived';

const days = (start: string, counts: number[]) =>
  counts.map((count, i) => ({ date: addDays(start, i), count }));

describe('computeStreaks', () => {
  it('finds the longest run and its dates', () => {
    const calendar = days('2026-01-01', [1, 1, 0, 3, 2, 4, 0, 1]);
    expect(computeStreaks(calendar, '2026-01-08')).toEqual({
      current: 1,
      longest: 3,
      longestStart: '2026-01-04',
      longestEnd: '2026-01-06',
    });
  });

  it('does not reset the current streak when today is still empty', () => {
    const calendar = days('2026-01-01', [0, 2, 3, 0]);
    expect(computeStreaks(calendar, '2026-01-04').current).toBe(2);
  });

  it('reports no current streak after two empty days', () => {
    const calendar = days('2026-01-01', [1, 1, 0, 0]);
    expect(computeStreaks(calendar, '2026-01-04').current).toBe(0);
  });

  it('handles an empty calendar', () => {
    expect(computeStreaks([], '2026-01-04')).toEqual({
      current: 0,
      longest: 0,
      longestStart: null,
      longestEnd: null,
    });
  });

  it('keeps the earliest run on a tie', () => {
    const calendar = days('2026-01-01', [2, 0, 2]);
    expect(computeStreaks(calendar, '2026-01-03')).toMatchObject({
      longest: 1,
      longestStart: '2026-01-01',
    });
  });

  it('treats a missing day as a break', () => {
    const calendar = [
      { date: '2026-01-01', count: 1 },
      { date: '2026-01-03', count: 1 },
    ];
    expect(computeStreaks(calendar, '2026-01-03').longest).toBe(1);
  });
});

describe('mergeRate', () => {
  it('is null when the stats are missing', () => {
    expect(mergeRate(null)).toBeNull();
  });

  it('is null when nothing was opened', () => {
    expect(mergeRate({ opened: 0, merged: 0, mergedAllTime: 5 })).toBeNull();
  });

  it('is merged over opened', () => {
    expect(mergeRate({ opened: 20, merged: 15, mergedAllTime: 90 })).toBe(0.75);
  });

  it('never exceeds 1, even if the two searches disagree by a race', () => {
    expect(mergeRate({ opened: 3, merged: 4, mergedAllTime: 4 })).toBe(1);
  });
});
