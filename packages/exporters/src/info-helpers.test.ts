import { describe, expect, it } from 'vitest';
import { layoutHeatmap } from './info-heatmap';
import { formatBytes, percentText, wrap } from './info-kit';

const week = (start: string, counts: number[]) =>
  counts.map((count, i) => {
    const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), count };
  });

describe('formatBytes', () => {
  it('uses powers of a thousand and trims needless decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1234)).toBe('1.2 KB');
    expect(formatBytes(15_000)).toBe('15 KB');
    expect(formatBytes(9_960)).toBe('10 KB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
    expect(formatBytes(3e15)).toBe('3000 TB');
  });
});

describe('percentText', () => {
  it('rounds, and never shows a misleading 0%', () => {
    expect(percentText(0.5)).toBe('50%');
    expect(percentText(0.004)).toBe('<1%');
    expect(percentText(0.0149)).toBe('1%');
    expect(percentText(1)).toBe('100%');
  });
});

describe('wrap', () => {
  it('breaks on words and never loses any', () => {
    const lines = wrap('ONE TWO THREE FOUR FIVE SIX SEVEN', 13, 1, 120);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('ONE TWO THREE FOUR FIVE SIX SEVEN');
  });

  it('keeps one long word on a line of its own', () => {
    expect(wrap('SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 13, 1, 50)).toEqual([
      'SUPERCALIFRAGILISTICEXPIALIDOCIOUS',
    ]);
  });
});

describe('layoutHeatmap', () => {
  it('puts a Sunday in the first row of the first column', () => {
    const { cells } = layoutHeatmap(week('2026-01-04', [1, 1, 1, 1, 1, 1, 1]));
    expect(cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(cells[6]).toMatchObject({ col: 0, row: 6 });
  });

  it('starts the first week partway down when the year starts midweek', () => {
    const { cells, columns } = layoutHeatmap(week('2026-01-07', [1, 1, 1, 1, 1, 1, 1]));
    expect(cells[0]).toMatchObject({ col: 0, row: 3 });
    expect(cells[4]).toMatchObject({ col: 1, row: 0 });
    expect(columns).toBe(2);
  });

  it('never needs more than 53 weeks for a year', () => {
    const year = Array.from({ length: 365 }, (_, i) => ({
      date: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count: i % 5,
    }));
    for (let shift = 0; shift < 7; shift++) {
      const days = year.slice(shift);
      expect(layoutHeatmap(days).columns).toBeLessThanOrEqual(53);
    }
  });

  it('gives a quiet day level 0 and a busy day a higher one', () => {
    const { cells } = layoutHeatmap(week('2026-01-04', [0, 1, 2, 3, 4, 5, 100]));
    expect(cells[0]!.level).toBe(0);
    expect(cells[6]!.level).toBe(4);
    expect(cells[1]!.level).toBeLessThan(cells[6]!.level);
  });

  it('never lets levels fall as counts rise', () => {
    const { cells } = layoutHeatmap(
      week('2026-01-04', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
    );
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i]!.level).toBeGreaterThanOrEqual(cells[i - 1]!.level);
    }
  });

  it('does not let one huge day flatten the rest', () => {
    const { cells } = layoutHeatmap(week('2026-01-04', [1, 2, 3, 4, 5, 6, 5000, 7, 8, 9]));
    const levels = new Set(cells.map((c) => c.level));
    expect(levels.size).toBeGreaterThanOrEqual(3);
  });

  it('gives equal busy days the same level, and a year of zeros level 0', () => {
    expect(
      new Set(layoutHeatmap(week('2026-01-04', [3, 3, 3, 3])).cells.map((c) => c.level)),
    ).toEqual(new Set([1]));
    expect(new Set(layoutHeatmap(week('2026-01-04', [0, 0, 0])).cells.map((c) => c.level))).toEqual(
      new Set([0]),
    );
  });

  it('labels months at least three weeks apart', () => {
    const year = Array.from({ length: 365 }, (_, i) => ({
      date: new Date(Date.parse('2026-01-03T00:00:00Z') + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
      count: 1,
    }));
    const { months } = layoutHeatmap(year);
    expect(months.length).toBeGreaterThanOrEqual(11);
    for (let i = 1; i < months.length; i++) {
      expect(months[i]!.col - months[i - 1]!.col).toBeGreaterThanOrEqual(3);
    }
  });

  it('copes with nothing, one day, and dates it cannot read', () => {
    expect(layoutHeatmap([]).cells).toEqual([]);
    expect(layoutHeatmap([{ date: '2026-01-04', count: 2 }]).cells).toHaveLength(1);
    expect(layoutHeatmap([{ date: 'not a date', count: 2 }]).cells).toEqual([]);
  });
});
