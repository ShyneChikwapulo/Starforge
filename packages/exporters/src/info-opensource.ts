import { measureCardText } from './card-text';
import { formatNumber, plural } from './hud';
import { CONTENT, PAD, clean, percentText, wrap, type InfoCardDef, type InfoCtx } from './info-kit';

const SHOWN = 6;
const LEFT_W = 420;
const RIGHT_X = PAD + 480;
const RIGHT_W = CONTENT - 480;
const ROW = 50;

/** Merged over opened, or null when nothing was opened (there is no rate to show). */
export function mergeRate(stats: { opened: number; merged: number }): number | null {
  return stats.opened > 0 ? Math.min(1, stats.merged / stats.opened) : null;
}

/** "0%" when nothing was merged, because "<1%" would suggest something was. */
const rateText = (stats: { merged: number }, rate: number): string =>
  stats.merged === 0 ? '0%' : percentText(rate);

/** The largest size, no bigger than `size`, at which `value` fits in `max` units. */
function fitSize(value: string, size: number, spacing: number, max: number): number {
  let current = size;
  while (current > 24 && measureCardText(value, current, spacing) > max) current -= 4;
  return current;
}

/** `name` in capitals, cut with an ellipsis until it fits in `max` units. */
function fitName(name: string, size: number, spacing: number, max: number): string {
  let value = clean(name);
  if (measureCardText(value, size, spacing) <= max) return value;
  while (value.length > 1 && measureCardText(`${value}…`, size, spacing) > max) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

/**
 * Pull request activity: what you opened and had merged in the last 12 months, the merge rate,
 * and the best-known projects you have had pull requests merged into.
 */
export const openSourceCard: InfoCardDef = {
  id: 'opensource',
  title: 'Open source',
  subtitle: (m) => `@${clean(m.user.login)} · PULL REQUESTS`,
  chips: (m) => {
    const chips: string[] = [];
    const stats = m.pullRequestStats;
    if (stats) {
      chips.push(`${formatNumber(stats.mergedAllTime)} MERGED ALL TIME`);
      const rate = mergeRate(stats);
      if (rate !== null) chips.push(`${rateText(stats, rate)} MERGE RATE`);
    }
    const reviews = m.contributions.reviews;
    if (reviews > 0) {
      chips.push(`${formatNumber(reviews)} ${plural(reviews, 'REVIEW', 'REVIEWS')}`);
    }
    return chips;
  },
  legend: (m) =>
    'Opened and merged are pull requests you opened in the last 12 months; merge rate is merged ' +
    'over opened, so open ones count against it. The list shows up to six repositories you do not ' +
    'own, most stars first (bars: log scale), from your 100 most recently updated merged pull ' +
    'requests.' +
    (m.contributions.reviews > 0 ? ' Reviews are as your profile shows them.' : ''),

  body(ctx: InfoCtx, top: number) {
    const { metrics, colors, text } = ctx;
    const stats = metrics.pullRequestStats;
    const notable = metrics.highlights?.notable ?? null;
    const repos = notable ? notable.repositories.slice(0, SHOWN) : [];
    const parts: string[] = [];

    parts.push(text(PAD, top + 14, 'LAST 12 MONTHS', { size: 13, fill: colors.label, spacing: 3 }));
    if (!stats) {
      parts.push(
        text(PAD + LEFT_W / 2, top + 100, 'NO PR DATA', {
          size: 22,
          fill: colors.muted,
          spacing: 4,
          anchor: 'middle',
        }),
      );
    } else {
      const blocks: [string, number, number][] = [
        ['OPENED', stats.opened, PAD],
        ['MERGED', stats.merged, PAD + 220],
      ];
      for (const [label, value, x] of blocks) {
        const shown = formatNumber(value);
        parts.push(
          text(x, top + 86, shown, { size: fitSize(shown, 56, 2, 196), spacing: 2 }),
          text(x, top + 112, label, { size: 13, fill: colors.muted, spacing: 3 }),
        );
      }
      const rate = mergeRate(stats);
      const barY = top + 174;
      parts.push(
        text(PAD, top + 160, 'MERGE RATE', { size: 13, fill: colors.muted, spacing: 3 }),
        text(PAD + LEFT_W, top + 164, rate === null ? '—' : rateText(stats, rate), {
          size: 22,
          anchor: 'end',
        }),
        `<rect x="${PAD}" y="${barY}" width="${LEFT_W}" height="10" ${ctx.track(0.15)}/>`,
      );
      if (rate !== null && rate > 0) {
        parts.push(
          `<rect x="${PAD}" y="${barY}" width="${Math.max(2, LEFT_W * rate).toFixed(1)}" height="10" fill="${colors.accent}"/>`,
        );
      }
    }

    parts.push(
      text(RIGHT_X, top + 14, 'MERGED INTO OTHER PROJECTS', {
        size: 13,
        fill: colors.label,
        spacing: 3,
      }),
    );
    if (!notable) {
      parts.push(
        text(RIGHT_X, top + 62, 'NOT COLLECTED', { size: 16, fill: colors.muted, spacing: 3 }),
      );
    } else {
      const count = notable.mergedPullRequests;
      parts.push(
        text(
          RIGHT_X + RIGHT_W,
          top + 14,
          `${formatNumber(count)} ${plural(count, 'PULL REQUEST', 'PULL REQUESTS')}`,
          { size: 13, fill: colors.muted, spacing: 3, anchor: 'end' },
        ),
      );
      if (repos.length === 0) {
        wrap(clean('No merged pull requests into other projects yet'), 16, 2, RIGHT_W).forEach(
          (line, i) => {
            parts.push(
              text(RIGHT_X, top + 62 + i * 24, line, { size: 16, fill: colors.muted, spacing: 2 }),
            );
          },
        );
      }
    }

    const logMax = Math.log10(Math.max(0, ...repos.map((repo) => repo.stars)) + 1);
    repos.forEach((repo, i) => {
      const y = top + 62 + i * ROW;
      const starsText = `${formatNumber(repo.stars)} ${plural(repo.stars, 'STAR', 'STARS')}`;
      const starsWidth = measureCardText(starsText, 14, 2);
      const fill =
        logMax > 0 && repo.stars > 0
          ? Math.max(2, (RIGHT_W * Math.log10(repo.stars + 1)) / logMax)
          : 0;
      parts.push(
        text(RIGHT_X, y, fitName(repo.nameWithOwner, 18, 2, RIGHT_W - starsWidth - 24), {
          size: 18,
          spacing: 2,
        }),
        text(RIGHT_X + RIGHT_W, y, starsText, {
          size: 14,
          fill: colors.muted,
          spacing: 2,
          anchor: 'end',
        }),
        `<rect x="${RIGHT_X}" y="${y + 12}" width="${RIGHT_W}" height="4" ${ctx.track(0.15)}/>`,
      );
      if (fill > 0) {
        parts.push(
          `<rect x="${RIGHT_X}" y="${y + 12}" width="${fill.toFixed(1)}" height="4" fill="${colors.accent}"/>`,
        );
      }
    });

    const height = Math.max(190, repos.length > 0 ? 62 + (repos.length - 1) * ROW + 22 : 120);
    parts.push(
      `<line x1="${PAD + 450}" y1="${top}" x2="${PAD + 450}" y2="${top + height}" ${ctx.edge(0.2)}/>`,
    );
    return { parts, height };
  },
};
