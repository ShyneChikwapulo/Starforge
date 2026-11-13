import { getStreaks, mergeRate, type Metrics } from '@starforge/github-data';

/**
 * A neon HUD profile card as a self-contained SVG: yellow on black, chamfered panels, dashed
 * dividers and a gauge. It is a flat image meant to sit beside the 3D presets in a README, so it
 * has its own dark background and works on a light or dark page. Everything animated is plain CSS,
 * which GitHub plays inside an <img>, and the base style is always the finished picture.
 */

const YELLOW = '#fcee09';
const BG = '#0a0a08';
const PANEL = '#13130d';
const ROW = '#1a1a12';
const WHITE = '#f4f4ee';
const MUTED = '#a8a56a';
const FONT = "Rajdhani, Orbitron, 'Share Tech Mono', 'Segoe UI', Helvetica, Arial, sans-serif";
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 500;
const DIAL_RADIUS = 38;

export interface CardOptions {
  /** Pixel width. The height follows the card's 8:5 shape. Default 800. */
  width?: number;
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const formatNumber = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const fit = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

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

interface TextStyle {
  size: number;
  fill?: string;
  weight?: number;
  spacing?: number;
  anchor?: 'start' | 'middle' | 'end';
  filter?: string;
  className?: string;
}

/** `content` must already be escaped. */
function text(x: number, y: number, content: string, style: TextStyle): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-size="${style.size}"`,
    `fill="${style.fill ?? WHITE}"`,
  ];
  if (style.weight) attrs.push(`font-weight="${style.weight}"`);
  if (style.spacing) attrs.push(`letter-spacing="${style.spacing}"`);
  if (style.anchor) attrs.push(`text-anchor="${style.anchor}"`);
  if (style.filter) attrs.push(`filter="url(#${style.filter})"`);
  if (style.className) attrs.push(`class="${style.className}"`);
  return `<text ${attrs.join(' ')}>${content}</text>`;
}

export function renderCardSvg(metrics: Metrics, options: CardOptions = {}): string {
  const width = options.width ?? VIEW_WIDTH;
  const height = Math.round((width * VIEW_HEIGHT) / VIEW_WIDTH);
  const { user, contributions, totals } = metrics;
  const stats = metrics.pullRequestStats;
  const rate = mergeRate(stats);
  const streaks = getStreaks(metrics);
  const calendar = contributions.calendar;
  const circumference = 2 * Math.PI * DIAL_RADIUS;

  const label = { size: 11, fill: YELLOW, spacing: 3 };
  const parts: string[] = [];

  // Background: a dark base, a yellow glow in the top-right corner and a faint grid.
  parts.push(
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="${BG}"/>`,
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#bgGlow)"/>`,
    `<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#grid)"/>`,
    `<path d="${panel(10, 10, 780, 480, { tl: 30, br: 30 })}" fill="none" stroke="${YELLOW}" stroke-opacity="0.55" stroke-width="1.2"/>`,
    `<rect class="pulse" x="44" y="8" width="170" height="5" fill="${YELLOW}" filter="url(#glow)"/>`,
  );

  // Header: the name in neon, and three chips.
  const name = fit((user.name ?? user.login).toUpperCase(), 15);
  parts.push(
    text(46, 78, escapeXml(name), {
      size: 38,
      fill: YELLOW,
      weight: 700,
      spacing: 3,
      filter: 'glow',
    }),
    text(48, 102, `@${escapeXml(user.login.toUpperCase())} · GITHUB`, {
      size: 12,
      fill: MUTED,
      spacing: 4,
    }),
  );
  const chips = [
    `${formatNumber(user.followers)} FOLLOWERS`,
    `${formatNumber(totals.repositories)} REPOS`,
    `SINCE ${new Date(user.createdAt).getUTCFullYear()}`,
  ];
  chips.forEach((chip, i) => {
    const x = 462 + i * 108;
    parts.push(
      `<path d="${panel(x, 50, 100, 30, { tl: 8, br: 8 })}" fill="${YELLOW}"/>`,
      text(x + 50, 69, escapeXml(chip), {
        size: 10.5,
        fill: BG,
        weight: 700,
        spacing: 1,
        anchor: 'middle',
      }),
    );
  });
  parts.push(
    `<line x1="30" y1="124" x2="770" y2="124" stroke="${YELLOW}" stroke-opacity="0.25" stroke-dasharray="2 6"/>`,
  );

  // Sidebar: the five biggest languages.
  parts.push(text(40, 150, 'LANGUAGES', label));
  const languages = metrics.languages.slice(0, 5);
  const topShare = languages[0]?.share || 1;
  if (languages.length === 0) {
    parts.push(text(40, 190, 'NO LANGUAGE DATA', { size: 11, fill: MUTED, spacing: 2 }));
  }
  languages.forEach((language, i) => {
    const y = 164 + i * 50;
    const percent = language.share * 100;
    parts.push(
      `<g class="lang-row">`,
      `<rect x="34" y="${y}" width="206" height="42" fill="${ROW}"/>`,
      `<rect x="237" y="${y}" width="3" height="42" fill="${i === 0 ? YELLOW : MUTED}" fill-opacity="${i === 0 ? 1 : 0.4}"/>`,
      `<rect x="46" y="${y + 13}" width="16" height="16" rx="4" fill="${language.color ?? YELLOW}"/>`,
      text(76, y + 19, escapeXml(fit(language.name.toUpperCase(), 12)), {
        size: 13,
        fill: i === 0 ? WHITE : '#d6d4b4',
        spacing: 2,
      }),
      text(228, y + 19, percent >= 1 ? `${Math.round(percent)}%` : '&lt;1%', {
        size: 12,
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
    const top = 160 + i * 66;
    parts.push(
      text(290, top + 22, item.label, label),
      text(290, top + 56, item.value, { size: 34, weight: 600 }),
    );
    if (item.note) {
      parts.push(
        text(540, top + 56, item.note, { size: 11, fill: MUTED, spacing: 1, anchor: 'end' }),
      );
    }
    if (i < headline.length - 1) {
      const y = top + 66;
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
    `<circle cx="674" cy="222" r="48" fill="none" stroke="${YELLOW}" stroke-opacity="0.35" stroke-width="4" stroke-dasharray="1.5 6.52"/>`,
    `<circle cx="674" cy="222" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-opacity="0.2" stroke-width="6"/>`,
    `<circle class="${rate === null ? '' : 'sweep'}" cx="674" cy="222" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-width="6" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 674 222)" filter="url(#glow)"/>`,
    text(674, 230, rate === null ? '—' : `${Math.round(rate * 100)}%`, {
      size: 22,
      weight: 600,
      anchor: 'middle',
    }),
    text(
      674,
      272,
      stats ? `${formatNumber(stats.merged)} OF ${formatNumber(stats.opened)} PRS` : 'NO PR DATA',
      {
        size: 10,
        fill: MUTED,
        spacing: 1,
        anchor: 'middle',
      },
    ),
  );

  // Streak: current and longest, and the last fortnight as bars.
  const recent = calendar.slice(-14);
  const peak = Math.max(1, ...recent.map((day) => day.count));
  parts.push(
    `<path d="${panel(578, 292, 192, 130, { bl: 20 })}" fill="${PANEL}" stroke="${YELLOW}" stroke-opacity="0.5"/>`,
    text(594, 314, 'CURRENT STREAK', label),
    `<text x="594" y="352" font-size="34" font-weight="600" fill="${WHITE}">${streaks.current}<tspan font-size="12" fill="${MUTED}" dx="8" letter-spacing="2">DAYS</tspan></text>`,
    text(594, 372, `LONGEST ${streaks.longest} DAYS`, { size: 10, fill: MUTED, spacing: 1 }),
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
      text(52, 451, project.tag, { size: 9, fill: YELLOW, spacing: 3 }),
      text(52, 466, escapeXml(fit(project.name, 30)), { size: 14, weight: 600 }),
      text(752, 458, `${formatNumber(project.stars)} STARS`, {
        size: 12,
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
    text(214, 486, 'ACTIVITY · 12 WEEKS', { size: 9, fill: MUTED, spacing: 3 }),
    text(762, 486, `SYNC ${metrics.generatedAt.slice(0, 10)}`, {
      size: 9,
      fill: MUTED,
      spacing: 2,
      anchor: 'end',
    }),
  );

  const title = `GitHub profile card for ${user.login}: ${formatNumber(totals.stars)} stars and ${formatNumber(contributions.commits)} commits in the last year`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-labelledby="card-title" font-family="${FONT}">
<title id="card-title">${escapeXml(title)}</title>
<defs>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="bgGlow" cx="85%" cy="12%" r="70%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${YELLOW}" stroke-opacity="0.05"/></pattern>
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
