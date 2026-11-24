import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { renderInfoCardSvg } from './info-card';
import { formatCompact, peakIndex, rhythmOf } from './info-rhythm';

const DAY = 86_400_000;
type Calendar = { date: string; count: number }[];

const span = (from: string, to: string, count = 1): Calendar => {
  const days: Calendar = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    days.push({ date: new Date(t).toISOString().slice(0, 10), count });
  }
  return days;
};

const base = createSampleMetrics();
const withCalendar = (calendar: Calendar): Metrics => ({
  ...base,
  contributions: { ...base.contributions, calendar },
});
const render = (calendar: Calendar): string =>
  renderInfoCardSvg(withCalendar(calendar), { card: 'rhythm' });
const labels = (svg: string): string =>
  [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(' ');

describe('formatCompact', () => {
  it('keeps small numbers and shortens big ones', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1000)).toBe('1K');
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(12_345)).toBe('12K');
    expect(formatCompact(999_500)).toBe('1M');
    expect(formatCompact(1_234_567)).toBe('1.2M');
    expect(formatCompact(2_000_000_000)).toBe('2B');
  });
});

describe('peakIndex', () => {
  it('is the earliest largest value, and null when nothing is above zero', () => {
    expect(peakIndex([3, 5, 5, 1])).toBe(1);
    expect(peakIndex([0, 0, 0])).toBeNull();
    expect(peakIndex([])).toBeNull();
  });
});

describe('rhythmOf', () => {
  it('sums by weekday with Sunday first', () => {
    const r = rhythmOf([
      { date: '2026-01-04', count: 2 },
      { date: '2026-01-05', count: 7 },
      { date: '2026-01-11', count: 1 },
    ]);
    expect(r.weekdays[0]).toBe(3);
    expect(r.weekdays[1]).toBe(7);
    expect(r.total).toBe(10);
  });

  it('marks the first and last month as partial and keeps the totals whole', () => {
    const r = rhythmOf(span('2025-11-10', '2026-11-09'));
    expect(r.months).toHaveLength(13);
    expect(r.months.map((m) => m.partial)).toEqual([true, ...Array<boolean>(11).fill(false), true]);
    expect(r.total).toBe(365);
    expect(r.months.reduce((sum, m) => sum + m.total, 0)).toBe(365);
    expect(r.weekdays.reduce((sum, v) => sum + v, 0)).toBe(365);
  });

  it('does not mark whole months as partial, leap February included', () => {
    expect(rhythmOf(span('2025-02-01', '2025-04-30')).months.some((m) => m.partial)).toBe(false);
    expect(rhythmOf(span('2024-01-01', '2024-02-29')).months.some((m) => m.partial)).toBe(false);
  });

  it('copes with one day, unsorted days, bad dates and no days', () => {
    expect(rhythmOf([{ date: '2026-01-01', count: 4 }]).months[0]!.partial).toBe(true);
    const mixed = rhythmOf([
      { date: '2026-01-02', count: 1 },
      { date: 'nonsense', count: 9 },
      { date: '2026-01-01', count: 1 },
    ]);
    expect(mixed.months).toHaveLength(1);
    expect(mixed.total).toBe(2);
    expect(rhythmOf([])).toEqual({ weekdays: [0, 0, 0, 0, 0, 0, 0], months: [], total: 0 });
  });
});

describe('the rhythm card', () => {
  it('names the busiest weekday and month, and fits its whole legend', () => {
    const svg = render([{ date: '2026-01-01', count: 5 }]);
    const text = labels(svg);
    expect(text).toContain('BUSIEST: THURSDAY');
    expect(text).toContain('PEAK MONTH: JAN');
    expect(text).toContain('BY WEEKDAY');
    expect(text).toContain('BY MONTH');
    expect(text).toContain('TOTALS, NOT AVERAGES');
    expect(text).toContain('THE FIRST AND LAST MONTH, WHICH ARE PARTIAL');
  });

  it('outlines partial months, and only partial months', () => {
    expect(render(span('2025-11-10', '2026-11-09'))).toContain('stroke-dasharray="3 3"');
    expect(render(span('2025-02-01', '2025-04-30'))).not.toContain('stroke-dasharray="3 3"');
  });

  it('says so when there is no activity data, and draws no chips', () => {
    const svg = render([]);
    expect(svg).toContain('aria-label="NO ACTIVITY DATA"');
    expect(svg).not.toContain('BUSIEST');
    expect(svg).not.toContain('NaN');
  });

  it('draws flat bars and no chips for a year with nothing in it', () => {
    const svg = render(span('2025-11-10', '2026-11-09', 0));
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('BUSIEST');
    expect(svg).toContain('aria-label="0"');
  });

  it('shortens huge totals so that the labels still fit', () => {
    const svg = render(span('2025-11-10', '2026-11-09', 4_000_000));
    expect(svg).not.toContain('NaN');
    expect(svg).toMatch(/aria-label="\d+(\.\d)?M"/);
  });

  it('shows only the latest 13 months of a longer calendar', () => {
    const text = labels(render(span('2024-01-01', '2026-06-30')));
    expect(text).toContain('2025');
    expect(text).not.toContain('2024');
  });
});
