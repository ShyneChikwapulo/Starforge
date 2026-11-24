import { CONTENT, PAD, clean, type InfoCardDef, type InfoCtx } from './info-kit';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** A year of days touches 13 calendar months at most; more than that is cut to the latest 13. */
const MAX_MONTHS = 13;
const LEFT_W = 432;
const RIGHT_X = PAD + 480;
const RIGHT_W = CONTENT - 480;
const CHART_HEIGHT = 120;
const HEIGHT = 250;

export interface MonthTotal {
  year: number;
  /** 1 to 12. */
  month: number;
  total: number;
  /** True when the window starts or ends part-way through this month. */
  partial: boolean;
}

export interface Rhythm {
  /** Total contributions per weekday, index 0 is Sunday as on GitHub. */
  weekdays: number[];
  /** Total contributions per calendar month, oldest first. */
  months: MonthTotal[];
  total: number;
}

/** 999, 1K, 1.2K, 12K, 1.2M: compact numbers for bar labels. */
export function formatCompact(value: number): string {
  let scaled = Math.max(0, Math.round(value));
  let unit = 0;
  while (scaled >= 1000 && unit < 3) {
    scaled /= 1000;
    unit++;
  }
  if (unit === 0) return String(scaled);
  let shown = Number(scaled.toFixed(scaled >= 10 ? 0 : 1));
  if (shown >= 1000 && unit < 3) {
    shown = Number((shown / 1000).toFixed(1));
    unit++;
  }
  return `${shown}${['', 'K', 'M', 'B'][unit]}`;
}

/** The index of the largest value, the earliest on a tie, or null when nothing is above zero. */
export function peakIndex(values: number[]): number | null {
  let best = -1;
  let max = 0;
  values.forEach((value, i) => {
    if (value > max) {
      max = value;
      best = i;
    }
  });
  return best < 0 ? null : best;
}

/** Sums a daily calendar by weekday and by calendar month. Totals, not averages. */
export function rhythmOf(calendar: { date: string; count: number }[]): Rhythm {
  const days = calendar
    .filter((day) => Number.isFinite(Date.parse(`${day.date}T00:00:00Z`)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const months: MonthTotal[] = [];
  let total = 0;
  for (const day of days) {
    const count = Math.max(0, day.count);
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    weekdays[weekday] = (weekdays[weekday] ?? 0) + count;
    total += count;
    const year = Number(day.date.slice(0, 4));
    const month = Number(day.date.slice(5, 7));
    const last = months[months.length - 1];
    if (last && last.year === year && last.month === month) last.total += count;
    else months.push({ year, month, total: count, partial: false });
  }
  if (days.length > 0) {
    const first = months[0]!;
    const last = months[months.length - 1]!;
    if (Number(days[0]!.date.slice(8, 10)) !== 1) first.partial = true;
    const lastDay = Number(days[days.length - 1]!.date.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(last.year, last.month, 0)).getUTCDate();
    if (lastDay !== daysInMonth) last.partial = true;
  }
  return { weekdays, months, total };
}

const shownMonths = (rhythm: Rhythm): MonthTotal[] => rhythm.months.slice(-MAX_MONTHS);

interface Bar {
  label: string;
  sub?: string;
  value: number;
  partial?: boolean;
}

/** A row of bars on a shared baseline: the busiest one at full strength, the rest quieter. */
function drawBars(
  ctx: InfoCtx,
  area: { x: number; width: number; base: number },
  bars: Bar[],
): string[] {
  const { colors, text } = ctx;
  const values = bars.map((bar) => bar.value);
  const max = Math.max(0, ...values);
  const peak = peakIndex(values);
  const slot = area.width / bars.length;
  const barWidth = Math.min(40, slot - 14);
  const r = (value: number): string => value.toFixed(1);
  const parts: string[] = [
    `<line x1="${r(area.x)}" y1="${area.base}" x2="${r(area.x + area.width)}" y2="${area.base}" ${ctx.edge(0.3)}/>`,
  ];
  bars.forEach((bar, i) => {
    const centre = area.x + slot * (i + 0.5);
    const isPeak = i === peak;
    const height = max > 0 && bar.value > 0 ? Math.max(2, (bar.value / max) * CHART_HEIGHT) : 0;
    if (height > 0) {
      const opacity = isPeak ? 1 : bar.partial ? 0.3 : 0.55;
      const outline = bar.partial
        ? ` stroke="${colors.accent}" stroke-opacity="0.9" stroke-width="1.2" stroke-dasharray="3 3"`
        : '';
      parts.push(
        `<rect x="${r(centre - barWidth / 2)}" y="${r(area.base - height)}" width="${r(barWidth)}" height="${r(height)}" fill="${colors.accent}" fill-opacity="${opacity}"${outline}/>`,
      );
    } else {
      parts.push(
        `<rect x="${r(centre - barWidth / 2)}" y="${area.base - 2}" width="${r(barWidth)}" height="2" ${ctx.track(0.3)}/>`,
      );
    }
    parts.push(
      text(centre, area.base - height - 8, formatCompact(bar.value), {
        size: 12,
        fill: isPeak ? colors.text : colors.muted,
        spacing: 1,
        anchor: 'middle',
      }),
      text(centre, area.base + 22, bar.label, {
        size: 12,
        fill: colors.muted,
        spacing: 2,
        anchor: 'middle',
      }),
    );
    if (bar.sub) {
      parts.push(
        text(centre, area.base + 40, bar.sub, {
          size: 11,
          fill: colors.soft,
          spacing: 2,
          anchor: 'middle',
        }),
      );
    }
  });
  return parts;
}

/** When your contributions happen: totals by weekday and by month, from the same daily counts. */
export const rhythmCard: InfoCardDef = {
  id: 'rhythm',
  title: 'Rhythm',
  subtitle: (m) => `@${clean(m.user.login)} · LAST 12 MONTHS`,
  chips: (m) => {
    const rhythm = rhythmOf(m.contributions.calendar);
    const chips: string[] = [];
    const day = peakIndex(rhythm.weekdays);
    if (day !== null) chips.push(`BUSIEST: ${WEEKDAY_NAMES[day]}`);
    const months = shownMonths(rhythm);
    const month = peakIndex(months.map((entry) => entry.total));
    if (month !== null) chips.push(`PEAK MONTH: ${MONTHS[months[month]!.month - 1]}`);
    return chips;
  },
  legend: () =>
    'Contributions summed by weekday and by month over the last 12 months, from the same daily ' +
    'counts as the heatmap; these are totals, not averages. Each chart has its own scale. A dashed ' +
    'outline marks the first and last month, which are partial.',

  body(ctx: InfoCtx, top: number) {
    const { metrics, colors, text } = ctx;
    const rhythm = rhythmOf(metrics.contributions.calendar);
    if (rhythm.months.length === 0) {
      return {
        parts: [
          text(PAD + CONTENT / 2, top + 70, 'NO ACTIVITY DATA', {
            size: 22,
            fill: colors.muted,
            spacing: 4,
            anchor: 'middle',
          }),
        ],
        height: 140,
      };
    }
    const base = top + 190;
    const weekdayBars: Bar[] = rhythm.weekdays.map((value, i) => ({
      label: WEEKDAYS[i]!,
      value,
    }));
    const monthBars: Bar[] = shownMonths(rhythm).map((entry, i) => ({
      label: MONTHS[entry.month - 1]!,
      sub: i === 0 || entry.month === 1 ? String(entry.year) : undefined,
      value: entry.total,
      partial: entry.partial,
    }));
    const parts: string[] = [
      text(PAD, top + 14, 'BY WEEKDAY', { size: 13, fill: colors.label, spacing: 3 }),
      text(RIGHT_X, top + 14, 'BY MONTH', { size: 13, fill: colors.label, spacing: 3 }),
      ...drawBars(ctx, { x: PAD, width: LEFT_W, base }, weekdayBars),
      ...drawBars(ctx, { x: RIGHT_X, width: RIGHT_W, base }, monthBars),
      `<line x1="${PAD + 450}" y1="${top}" x2="${PAD + 450}" y2="${top + HEIGHT}" ${ctx.edge(0.2)}/>`,
    ];
    return { parts, height: HEIGHT };
  },
};
