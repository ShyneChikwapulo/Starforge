import { getStreaks, mergeRate, type Metrics } from '@starforge/github-data';
import { GlyphSet, drawText, escapeXml, measureCardText, type DrawTextStyle } from './card-text';

/**
 * A neon HUD profile card as a self-contained SVG: yellow on black, chamfered panels, dashed
 * dividers and a gauge. It is a flat image meant to sit beside the 3D presets in a README, so it
 * has its own dark background and works on a light or dark page. Its text is drawn as vector
 * outlines, so it looks the same everywhere. Everything animated is plain CSS, which GitHub plays
 * inside an <img>, and the base style is always the finished picture.
 */

const YELLOW = '#fcee09';
const BG = '#0a0a08';
const PANEL = '#13130d';
const ROW = '#1a1a12';
const WHITE = '#f4f4ee';
const MUTED = '#a8a56a';
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 500;
const DIAL_RADIUS = 34;
const TICK_RADIUS = 43;
const NAME_SPACING = 3;

export interface CardOptions {
  /** Pixel width. The height follows the card's 8:5 shape. Default 800. */
  width?: number;
}

const formatNumber = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

const fit = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * The name to show and the size to draw it at, so it fits in `maxWidth`: as large as 38, no
 * smaller than 20, and cut short with an ellipsis when even that is too wide.
 */
export function fitName(name: string, maxWidth: number): { text: string; size: number } {
  for (let max = 24; max > 3; max--) {
    const text = fit(name, max);
    const room = maxWidth - NAME_SPACING * Math.max(0, [...text].length - 1);
    const size = Math.floor(room / measureCardText(text, 1));
    if (size >= 20) return { text, size: Math.min(38, size) };
  }
  return { text: fit(name, 3), size: 20 };
}

interface Cuts {
  tl?: number;
  tr?: number;
  br?: number;
  bl?: number;
}

/** A rectangle with any of its corners cut off at 45 degrees. */
function panel(x: number, y: number, w: number, h: number, cuts: Cuts = {}): string {
  const { tl = 0, tr = 0, br = 0, bl = 0 } = cuts;
  return (
    `M${x + tl},${y} L${x + w - tr},${y} L${x + w},${y + tr} L${x + w},${y + h - br} ` +
    `L${x + w - br},${y + h} L${x + bl},${y + h} L${x},${y + h - bl} L${x},${y + tl} Z`
  );
}

type Style = Omit<DrawTextStyle, 'fill'> & { fill?: string };

export function renderCardSvg(metrics: Metrics, options: CardOptions = {}): string {
  const width = options.width ?? VIEW_WIDTH;
  const height = Math.round((width * VIEW_HEIGHT) / VIEW_WIDTH);
  const { user, contributions, totals } = metrics;
  const stats = metrics.pullRequestStats;
  const rate = mergeRate(stats);
  const streaks = getStreaks(metrics);
  const calendar = contributions.calendar;
  const circumference = 2 * Math.PI * DIAL_RADIUS;

  const glyphs = new GlyphSet();
  const text = (x: number, y: number, content: string, style: Style): string =>
    drawText(glyphs, x, y, content, { ...style, fill: style.fill ?? WHITE });
  const label: Style = { size: 11, fill: YELLOW, spacing: 3 };
  const parts: string[] = [];

  // Background: a dark base, a yellow glow in the top-right corner and a faint grid.
  parts.push(
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="${BG}"/>`,
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#bgGlow)"/>`,
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#grid)"/>`,
    `<path d="${panel(10, 10, 780, 480, { tl: 30, br: 30 })}" fill="none" stroke="${YELLOW}" stroke-opacity="0.55" stroke-width="1.2"/>`,
    `<rect class="pulse" x="44" y="8" width="170" height="5" fill="${YELLOW}" filter="url(#glow)"/>`,
  );

  // Header: three chips along the right, and the name in the space they leave.
  const chips = [
    `${formatNumber(user.followers)} ${plural(user.followers, 'FOLLOWER', 'FOLLOWERS')}`,
    `${formatNumber(totals.repositories)} ${plural(totals.repositories, 'REPO', 'REPOS')}`,
    `SINCE ${new Date(user.createdAt).getUTCFullYear()}`,
  ];
  const chipWidths = chips.map((chip) => Math.ceil(measureCardText(chip, 12, 1)) + 24);
  const gap = 8;
  const chipsStart = 770 - chipWidths.reduce((sum, w) => sum + w, 0) - gap * (chips.length - 1);
  let chipX = chipsStart;
  chips.forEach((chip, i) => {
    const w = chipWidths[i]!;
    parts.push(
      `<path d="${panel(chipX, 50, w, 30, { tl: 8, br: 8 })}" fill="${YELLOW}"/>`,
      text(chipX + w / 2, 70, chip, { size: 12, fill: BG, spacing: 1, anchor: 'middle' }),
    );
    chipX += w + gap;
  });
  const name = fitName((user.name ?? user.login).toUpperCase(), chipsStart - 46 - 16);
  parts.push(
    text(46, 40 + name.size, name.text, {
      size: name.size,
      fill: YELLOW,
      spacing: NAME_SPACING,
      filter: 'glow',
    }),
    text(48, 102, `@${user.login.toUpperCase()} · GITHUB`, { size: 13, fill: MUTED, spacing: 4 }),
    `<line x1="30" y1="124" x2="770" y2="124" stroke="${YELLOW}" stroke-opacity="0.25" stroke-dasharray="2 6"/>`,
  );

  // Sidebar: the five biggest languages.
  parts.push(text(40, 150, 'LANGUAGES', label));
  const languages = metrics.languages.slice(0, 5);
  const topShare = languages[0]?.share || 1;
  if (languages.length === 0) {
    parts.push(text(40, 190, 'NO LANGUAGE DATA', { size: 12, fill: MUTED, spacing: 2 }));
  }
  languages.forEach((language, i) => {
    const y = 164 + i * 50;
    const percent = language.share * 100;
    parts.push(
      `<g class="lang-row">`,
      `<rect x="34" y="${y}" width="206" height="42" fill="${ROW}"/>`,
      `<rect x="237" y="${y}" width="3" height="42" fill="${i === 0 ? YELLOW : MUTED}" fill-opacity="${i === 0 ? 1 : 0.4}"/>`,
      `<rect x="46" y="${y + 13}" width="16" height="16" rx="4" fill="${language.color ?? YELLOW}"/>`,
      text(76, y + 20, fit(language.name.toUpperCase(), 12), {
        size: 15,
        fill: i === 0 ? WHITE : '#d6d4b4',
        spacing: 2,
      }),
      text(228, y + 20, percent >= 1 ? `${Math.round(percent)}%` : '<1%', {
        size: 14,
        fill: MUTED,
        anchor: 'end',
      }),
      `<rect x="76" y="${y + 29}" width="152" height="3" fill="${YELLOW}" fill-opacity="0.15"/>`,
      `<rect x="76" y="${y + 29}" width="${(152 * language.share) / topShare}" height="3" fill="${language.color ?? YELLOW}"/>`,
      `</g>`,
    );
  });

  // Main panel: four headline numbers.
  parts.push(
    `<path d="${panel(262, 140, 296, 282, { tl: 36, br: 24 })}" fill="${PANEL}" stroke="${YELLOW}" stroke-opacity="0.5"/>`,
    `<polygon points="262,176 298,140 262,140" fill="${YELLOW}"/>`,
    `<rect class="pulse" x="330" y="137" width="150" height="4" fill="${YELLOW}" filter="url(#glow)"/>`,
  );
  const headline: { label: string; value: string; note?: string }[] = [
    { label: 'STARS EARNED', value: formatNumber(totals.stars) },
    { label: 'COMMITS · LAST 12 MONTHS', value: formatNumber(contributions.commits) },
    {
      label: 'PULL REQUESTS MERGED',
      value: stats ? formatNumber(stats.merged) : '—',
      note: stats ? `${formatNumber(stats.mergedAllTime)} ALL TIME` : undefined,
    },
    { label: 'PULL REQUEST REVIEWS', value: formatNumber(contributions.reviews) },
  ];
  headline.forEach((item, i) => {
    const top = 156 + i * 64;
    parts.push(
      text(290, top + 20, item.label, label),
      text(290, top + 54, item.value, { size: 36 }),
    );
    if (item.note) {
      parts.push(
        text(540, top + 54, item.note, { size: 13, fill: MUTED, spacing: 1, anchor: 'end' }),
      );
    }
    if (i < headline.length - 1) {
      const y = top + 64;
      parts.push(
        `<line x1="262" y1="${y}" x2="558" y2="${y}" stroke="${YELLOW}" stroke-opacity="0.3" stroke-dasharray="4 4"/>`,
        `<polygon points="262,${y - 5} 271,${y} 262,${y + 5}" fill="${YELLOW}"/>`,
      );
    }
  });

  // Gauge: the merge rate.
  const offset = circumference * (1 - (rate ?? 0));
  parts.push(
    `<path d="${panel(578, 140, 192, 140, { tr: 20 })}" fill="${PANEL}" stroke="${YELLOW}" stroke-opacity="0.5"/>`,
    text(594, 162, 'MERGE RATE', label),
    `<circle cx="674" cy="218" r="${TICK_RADIUS}" fill="none" stroke="${YELLOW}" stroke-opacity="0.35" stroke-width="4" stroke-dasharray="1.5 6.5"/>`,
    `<circle cx="674" cy="218" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-opacity="0.2" stroke-width="6"/>`,
    `<circle class="${rate === null ? '' : 'sweep'}" cx="674" cy="218" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-width="6" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 674 218)" filter="url(#glow)"/>`,
    text(674, 226, rate === null ? '—' : `${Math.round(rate * 100)}%`, {
      size: 22,
      anchor: 'middle',
    }),
    text(
      674,
      273,
      stats ? `${formatNumber(stats.merged)} OF ${formatNumber(stats.opened)} PRS` : 'NO PR DATA',
      { size: 11, fill: MUTED, spacing: 1, anchor: 'middle' },
    ),
  );

  // Streak: current and longest, and the last fortnight as bars.
  const recent = calendar.slice(-14);
  const peak = Math.max(1, ...recent.map((day) => day.count));
  const streak = String(streaks.current);
  parts.push(
    `<path d="${panel(578, 292, 192, 130, { bl: 20 })}" fill="${PANEL}" stroke="${YELLOW}" stroke-opacity="0.5"/>`,
    text(594, 314, 'CURRENT STREAK', label),
    text(594, 352, streak, { size: 36 }),
    text(594 + measureCardText(streak, 36) + 8, 352, plural(streaks.current, 'DAY', 'DAYS'), {
      size: 14,
      fill: MUTED,
      spacing: 2,
    }),
    text(594, 372, `LONGEST ${streaks.longest} ${plural(streaks.longest, 'DAY', 'DAYS')}`, {
      size: 11,
      fill: MUTED,
      spacing: 1,
    }),
  );
  recent.forEach((day, i) => {
    const barHeight = 3 + (19 * day.count) / peak;
    parts.push(
      `<rect x="${594 + i * 12}" y="${412 - barHeight}" width="8" height="${barHeight.toFixed(1)}" fill="${YELLOW}" fill-opacity="${day.count > 0 ? 0.9 : 0.25}"/>`,
    );
  });

  // Bottom bar: the pinned project, or the most starred one.
  const pinned = metrics.highlights?.pinned[0];
  const best = metrics.repositories[0];
  const project = pinned
    ? {
        tag: 'PINNED PROJECT',
        name: pinned.nameWithOwner.split('/').pop() ?? pinned.nameWithOwner,
        stars: pinned.stars,
      }
    : best
      ? { tag: 'TOP PROJECT', name: best.name, stars: best.stars }
      : null;
  parts.push(
    `<path d="${panel(34, 436, 736, 36, { bl: 14, tr: 14 })}" fill="${ROW}" stroke="${YELLOW}" stroke-opacity="0.4"/>`,
  );
  if (project) {
    parts.push(
      text(52, 450, project.tag, { size: 10, fill: YELLOW, spacing: 3 }),
      text(52, 466, fit(project.name, 30), { size: 16 }),
      text(752, 458, `${formatNumber(project.stars)} ${plural(project.stars, 'STAR', 'STARS')}`, {
        size: 14,
        fill: MUTED,
        spacing: 2,
        anchor: 'end',
      }),
    );
  }
  parts.push(
    `<rect x="420" y="447" width="120" height="2" fill="${YELLOW}"/>`,
    `<rect x="420" y="454" width="80" height="2" fill="${YELLOW}" fill-opacity="0.6"/>`,
    `<rect x="420" y="461" width="100" height="2" fill="${YELLOW}" fill-opacity="0.35"/>`,
  );

  // Footer: the last twelve weeks as a row of squares, brighter for a busier week.
  const weeks: number[] = [];
  const tail = calendar.slice(-84);
  const padding = 84 - tail.length;
  for (let w = 0; w < 12; w++) {
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const index = w * 7 + d - padding;
      if (index >= 0) sum += tail[index]?.count ?? 0;
    }
    weeks.push(sum);
  }
  const busiestWeek = Math.max(1, ...weeks);
  weeks.forEach((sum, i) => {
    parts.push(
      `<rect x="${40 + i * 14}" y="478" width="8" height="8" fill="${YELLOW}" fill-opacity="${(0.15 + (0.85 * sum) / busiestWeek).toFixed(2)}"/>`,
    );
  });
  parts.push(
    text(214, 486, 'ACTIVITY · 12 WEEKS', { size: 10, fill: MUTED, spacing: 3 }),
    text(762, 486, `SYNC ${metrics.generatedAt.slice(0, 10)}`, {
      size: 10,
      fill: MUTED,
      spacing: 2,
      anchor: 'end',
    }),
  );

  const title =
    `GitHub profile card for ${user.login}: ` +
    `${formatNumber(totals.stars)} ${plural(totals.stars, 'star', 'stars')} and ` +
    `${formatNumber(contributions.commits)} ${plural(contributions.commits, 'commit', 'commits')} in the last year`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-labelledby="card-title">
<title id="card-title">${escapeXml(title)}</title>
<defs>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="bgGlow" cx="85%" cy="12%" r="70%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${YELLOW}" stroke-opacity="0.05"/></pattern>
${glyphs.definitions()}
</defs>
<style>
.pulse{animation:pulse 2.6s ease-in-out infinite}
.sweep{animation:sweep 1.4s ease-out both}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes sweep{from{stroke-dashoffset:${circumference.toFixed(2)}}}
@media (prefers-reduced-motion:reduce){.pulse,.sweep{animation:none}}
</style>
${parts.join('\n')}
</svg>
`;
}
