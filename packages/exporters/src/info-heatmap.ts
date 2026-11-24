import { getStreaks } from '@starforge/github-data';
import { formatNumber, plural } from './hud';
import { measureCardText } from './card-text';
import { CONTENT, PAD, clean, type InfoCardDef, type InfoCtx } from './info-kit';

const DAY = 86_400_000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** The accent's opacity at each level above zero. */
const OPACITY = [0.3, 0.55, 0.8, 1];

export interface HeatCell {
  col: number;
  /** 0 is Sunday, as on GitHub. */
  row: number;
  /** 0 for a quiet day, 1 to 4 for busier ones. */
  level: number;
  date: string;
  count: number;
}

export interface HeatLayout {
  cells: HeatCell[];
  columns: number;
  months: { col: number; month: number }[];
}

/**
 * Where every day goes in a grid of weeks, and how busy it is. A day's level is its place among
 * your busy days (the quartiles of the non-zero counts), as on GitHub, so one huge day does not
 * flatten the rest of the year.
 */
export function layoutHeatmap(calendar: { date: string; count: number }[]): HeatLayout {
  const days = calendar.filter((day) => Number.isFinite(Date.parse(`${day.date}T00:00:00Z`)));
  if (days.length === 0) return { cells: [], columns: 0, months: [] };

  const start = Date.parse(`${days[0]!.date}T00:00:00Z`);
  const firstWeekday = new Date(start).getUTCDay();
  const busy = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const at = (p: number): number =>
    busy[Math.min(busy.length - 1, Math.floor(p * busy.length))] ?? 0;
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  const levelOf = (count: number): number =>
    count <= 0 ? 0 : count <= q1 ? 1 : count <= q2 ? 2 : count <= q3 ? 3 : 4;

  const cells = days.map((day): HeatCell => {
    const position = Math.round((Date.parse(`${day.date}T00:00:00Z`) - start) / DAY) + firstWeekday;
    return {
      col: Math.floor(position / 7),
      row: ((position % 7) + 7) % 7,
      level: levelOf(day.count),
      date: day.date,
      count: day.count,
    };
  });
  const columns = Math.max(...cells.map((cell) => cell.col)) + 1;

  // A month label sits over the week its first day falls in, at least three weeks apart.
  const labels: { col: number; month: number }[] = [];
  cells.forEach((cell, i) => {
    const dayOfMonth = Number(cell.date.slice(8, 10));
    if (dayOfMonth === 1 || (i === 0 && dayOfMonth <= 10)) {
      labels.push({ col: cell.col, month: Number(cell.date.slice(5, 7)) - 1 });
    }
  });
  const months: { col: number; month: number }[] = [];
  let last = -10;
  for (const label of labels) {
    if (label.col - last >= 3) {
      months.push(label);
      last = label.col;
    }
  }
  return { cells, columns, months };
}

/** A year of contributions as a grid of days, the way GitHub draws it. */
export const heatmapCard: InfoCardDef = {
  id: 'heatmap',
  title: 'Activity',
  subtitle: (m) => `@${clean(m.user.login)} · LAST 12 MONTHS`,
  chips: (m) => {
    const calendar = m.contributions.calendar;
    if (calendar.length === 0) return [];
    const total = calendar.reduce((sum, day) => sum + day.count, 0);
    const active = calendar.filter((day) => day.count > 0).length;
    const longest = getStreaks(m).longest;
    return [
      `${formatNumber(total)} ${plural(total, 'CONTRIBUTION', 'CONTRIBUTIONS')}`,
      `${formatNumber(active)} ACTIVE ${plural(active, 'DAY', 'DAYS')}`,
      `LONGEST STREAK ${formatNumber(longest)}`,
    ];
  },
  legend: () =>
    'Contributions per day over the last 12 months: commits, pull requests, issues and reviews, as ' +
    'your GitHub profile shows them. The colour steps are the quartiles of your busy days.',

  body(ctx: InfoCtx, top: number) {
    const { metrics, colors, text } = ctx;
    const { cells, columns, months } = layoutHeatmap(metrics.contributions.calendar);
    if (cells.length === 0) {
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

    const parts: string[] = [];
    const labelWidth = 46;
    const gridX = PAD + labelWidth;
    const weeks = Math.max(53, columns);
    const pitch = (CONTENT - labelWidth) / weeks;
    const size = pitch - 4;
    const gridTop = top + 30;
    const r = (value: number): string => value.toFixed(1);

    for (const { col, month } of months) {
      parts.push(
        text(gridX + col * pitch, top + 14, MONTHS[month]!, {
          size: 12,
          fill: colors.muted,
          spacing: 2,
        }),
      );
    }
    ['MON', 'WED', 'FRI'].forEach((label, i) => {
      parts.push(
        text(PAD, gridTop + (1 + 2 * i) * pitch + size - 2, label, {
          size: 11,
          fill: colors.muted,
          spacing: 2,
        }),
      );
    });

    // One path of squares per level: compact, and every square shares one fill.
    const fills = [
      ctx.track(0.1),
      ...OPACITY.map((opacity) => `fill="${colors.accent}" fill-opacity="${opacity}"`),
    ];
    for (let level = 0; level <= 4; level++) {
      const d = cells
        .filter((cell) => cell.level === level)
        .map(
          (cell) =>
            `M${r(gridX + cell.col * pitch)} ${r(gridTop + cell.row * pitch)}h${r(size)}v${r(size)}h${r(-size)}z`,
        )
        .join('');
      if (d) parts.push(`<path d="${d}" ${fills[level]}/>`);
    }

    // The key: LESS, five squares, MORE, right-aligned under the grid.
    const keyY = gridTop + 7 * pitch + 28;
    const right = PAD + CONTENT;
    const more = 'MORE';
    const moreWidth = measureCardText(more, 12, 2);
    const swatch = 14;
    const swatchGap = 4;
    const swatchesRight = right - moreWidth - 10;
    const swatchesLeft = swatchesRight - (5 * swatch + 4 * swatchGap);
    parts.push(
      text(right, keyY, more, { size: 12, fill: colors.muted, spacing: 2, anchor: 'end' }),
      text(swatchesLeft - 10, keyY, 'LESS', {
        size: 12,
        fill: colors.muted,
        spacing: 2,
        anchor: 'end',
      }),
    );
    for (let level = 0; level <= 4; level++) {
      parts.push(
        `<rect x="${swatchesLeft + level * (swatch + swatchGap)}" y="${keyY - swatch + 2}" width="${swatch}" height="${swatch}" ${fills[level]}/>`,
      );
    }
    return { parts, height: 30 + 7 * pitch + 28 + 8 };
  },
};
