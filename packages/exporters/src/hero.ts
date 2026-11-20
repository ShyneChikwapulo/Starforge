import { getStreaks, mergeRate, type Metrics } from '@starforge/github-data';
import { GlyphSet, drawText, escapeXml, measureCardText, type DrawTextStyle } from './card-text';
import { fit, formatNumber, plural } from './hud';
import { resolveSkin, type Skin, type SkinName } from './skin';
import { chromeLayer, type Cap } from './chrome';
import { DISPLAY_FONT } from './display-font-data';

/**
 * The hero card: a 4:3 neon HUD that serves as a profile README's banner and profile card at
 * once. Languages down the left, headline numbers in the middle, and on the right an animated
 * character in front of slow rings, with the streak and the pinned project below. Everything is
 * one self-contained SVG; the animation is plain CSS, which GitHub plays inside an <img>.
 */

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 900;
const ROW_COUNT = 8;
const DIAL_RADIUS = 44;
const TICK_RADIUS = 56;
const RING_X = 975;
const RING_Y = 440;

/** Where the character is drawn, in card units. Frames should be rendered at this size. */
export const HERO_SLOT = { x: 780, y: 190, width: 380, height: 500 } as const;

/** A horizontal strip of equally wide animation frames. */
export interface HeroCharacter {
  /** A data URI (or URL) of the strip. */
  href: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** Frame order for one loop. Default: forwards, then back without repeating the ends. */
  sequence?: number[];
  /** Frames per second. Default 8. */
  fps?: number;
  /**
   * Pixels per card unit. At the default of 1 a frame is drawn at its pixel size; frames made
   * 1.5 times larger, for a sharper picture, are drawn at a density of 1.5.
   */
  density?: number;
}

export interface HeroOptions {
  /** Pixel width. The height follows the 4:3 shape. Default 1200. */
  width?: number;
  character?: HeroCharacter;
  /**
   * Draw as one piece of a stack of cards: the page chrome's continuous rails instead of a closed
   * frame. Default: a standalone card with its own frame.
   */
  stack?: Cap;
  /** The look of the card. Default: cyberpunk. */
  skin?: SkinName | Skin;
}

type Style = Omit<DrawTextStyle, 'fill'> & { fill?: string };

const NAME_SPACING = 0;

/**
 * Where the name goes in the title bar. Its box runs from NAME_TOP, just under the bar's top edge,
 * to NAME_BOTTOM, just above the chips. The font is hand-drawn, so its letters rise and fall by
 * different amounts; the box is sized for the tallest initial (drawn leadScale times larger) and
 * the deepest descender. That fixes the largest size and the baseline, the same for every name, so
 * a name never touches the chips however it is spelt.
 */
const NAME_TOP = 54;
const NAME_BOTTOM = 140;
const NAME_WIDTH = 1112 - 96;
const NAME_EM = ((DISPLAY_FONT.ascent + DISPLAY_FONT.descent) * DISPLAY_FONT.leadScale) / 1000;
const NAME_MAX_SIZE = Math.floor((NAME_BOTTOM - NAME_TOP) / NAME_EM);

export const HERO_NAME = {
  top: NAME_TOP,
  bottom: NAME_BOTTOM,
  width: NAME_WIDTH,
  maxSize: NAME_MAX_SIZE,
  baseline: NAME_TOP + (DISPLAY_FONT.ascent * DISPLAY_FONT.leadScale * NAME_MAX_SIZE) / 1000,
} as const;

/**
 * The name for the title bar: capitals, in characters the fonts have. Accents are dropped, anything
 * else outside A-Z, digits and . ' - & becomes a space, and spaces are tidied. A name with no
 * letter left (written in another script, or only emoji) shows the login instead, which GitHub
 * keeps to plain ASCII.
 */
function cleanName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .'&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayName(user: { name: string | null; login: string }): string {
  const own = cleanName(user.name ?? '');
  return /[A-Z]/.test(own) ? own : cleanName(user.login);
}

function heroName(name: string, maxWidth: number): { text: string; size: number } {
  for (let max = 26; max > 3; max--) {
    const text = fit(name, max);
    const room = maxWidth - NAME_SPACING * Math.max(0, [...text].length - 1);
    const size = Math.floor(room / measureCardText(text, 1, 0, 'display', true));
    if (size >= 30) return { text, size: Math.min(NAME_MAX_SIZE, size) };
  }
  return { text: fit(name, 3), size: 30 };
}

/** The name as it is drawn: its text, and the size that fits the title bar. */
export function layoutHeroName(user: { name: string | null; login: string }): {
  text: string;
  size: number;
} {
  return heroName(displayName(user), NAME_WIDTH);
}

const pingPong = (count: number): number[] => {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 2; i > 0; i--) order.push(i);
  return order;
};

function characterCss(character: HeroCharacter): string {
  const order = character.sequence ?? pingPong(character.frames);
  const fps = character.fps ?? 8;
  const density = character.density ?? 1;
  const keyframes = order
    .map(
      (frame, k) =>
        `${((100 * k) / order.length).toFixed(3)}%{transform:translateX(${Number((-(frame * character.frameWidth) / density).toFixed(3))}px)}`,
    )
    .join('');
  return `.char{animation:char ${(order.length / fps).toFixed(3)}s step-end infinite}@keyframes char{${keyframes}}`;
}

export function renderHeroSvg(metrics: Metrics, options: HeroOptions = {}): string {
  const width = options.width ?? VIEW_WIDTH;
  const height = Math.round((width * VIEW_HEIGHT) / VIEW_WIDTH);
  const skin = resolveSkin(options.skin);
  const {
    accent: YELLOW,
    accent2: CYAN,
    bg: BG,
    panel: PANEL,
    row: ROW,
    text: WHITE,
    muted: MUTED,
    soft: SOFT,
  } = skin.colors;
  const panel = skin.shape;
  const bracket = (x: number, y: number, sx: number, sy: number): string =>
    `<path d="M${x},${y + sy * 12} V${y} H${x + sx * 12}" fill="none" stroke="${YELLOW}" stroke-width="2" stroke-opacity="0.8"/>`;
  const lock = (x: number, y: number): string =>
    `<rect x="${x}" y="${y + 6}" width="14" height="10" fill="${MUTED}" fill-opacity="0.35"/>` +
    `<path d="M${x + 3},${y + 6} V${y + 3} a4,4 0 0 1 8,0 V${y + 6}" fill="none" stroke="${MUTED}" stroke-opacity="0.35" stroke-width="2"/>`;
  const { user, contributions, totals } = metrics;
  const stats = metrics.pullRequestStats;
  const rate = mergeRate(stats);
  const streaks = getStreaks(metrics);
  const calendar = contributions.calendar;
  const circumference = 2 * Math.PI * DIAL_RADIUS;
  const stack = options.stack;

  const glyphs = new GlyphSet();
  const text = (x: number, y: number, content: string, style: Style): string =>
    drawText(glyphs, x, y, content, { ...style, fill: style.fill ?? WHITE });
  const label: Style = { size: 15, fill: YELLOW, spacing: 4 };
  const frame = panel(12, 12, 1176, 876, { tl: 44, br: 44 });
  const parts: string[] = [];

  // Background: base, two glows, a faint tunnel of lines, the slow rings, the frame and its marks.
  const tunnel = Array.from({ length: 56 }, (_, i) => {
    const angle = (i / 56) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return `<line x1="${(600 + c * 190).toFixed(1)}" y1="${(450 + s * 190).toFixed(1)}" x2="${(600 + c * 820).toFixed(1)}" y2="${(450 + s * 820).toFixed(1)}"/>`;
  }).join('');
  const arc = 0.72 * 2 * Math.PI * 226;
  parts.push(
    ...(stack
      ? [chromeLayer(VIEW_WIDTH, VIEW_HEIGHT, stack, skin)]
      : [`<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="${BG}"/>`]),
    ...(stack ? [] : [`<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#glowTR)"/>`]),
    ...(stack ? [] : [`<rect width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#glowBL)"/>`]),
    `<g stroke="${YELLOW}" stroke-opacity="0.05" stroke-width="1.2" clip-path="url(#frame)">${tunnel}</g>`,
    `<g clip-path="url(#frame)" fill="none" stroke="${YELLOW}">`,
    `<circle class="spin-a" cx="${RING_X}" cy="${RING_Y}" r="262" stroke-opacity="0.3" stroke-width="10" stroke-dasharray="2 9.2"/>`,
    `<circle class="spin-b" cx="${RING_X}" cy="${RING_Y}" r="226" stroke-opacity="0.55" stroke-width="7" stroke-dasharray="${arc.toFixed(1)} ${(2 * Math.PI * 226 - arc).toFixed(1)}"/>`,
    `<circle cx="${RING_X}" cy="${RING_Y}" r="190" stroke-opacity="0.2" stroke-width="2"/>`,
    `<circle cx="${RING_X}" cy="${RING_Y}" r="300" stroke-opacity="0.12" stroke-width="1.5"/>`,
    `</g>`,
    ...(stack
      ? []
      : [
          `<path d="${frame}" fill="none" stroke="${YELLOW}" stroke-opacity="0.55" stroke-width="1.6"/>`,
        ]),
    ...(stack
      ? []
      : [
          `<rect class="pulse" x="92" y="9" width="240" height="7" fill="${YELLOW}" filter="url(#glow)"/>`,
        ]),
    ...(stack
      ? []
      : [
          `<path d="M36,70 L36,176 L66,176" fill="none" stroke="${YELLOW}" stroke-width="6" filter="url(#glow)"/>`,
        ]),
  );

  // Header: the name as a wordmark with a cyan glitch layer, three chips on the second row.
  parts.push(
    `<path d="${panel(56, 48, 1088, 138, { tl: 30, br: 30 })}" fill="${PANEL}" fill-opacity="0.85" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4"/>`,
  );
  const chips = [
    `${formatNumber(user.followers)} ${plural(user.followers, 'FOLLOWER', 'FOLLOWERS')}`,
    `${formatNumber(totals.repositories)} ${plural(totals.repositories, 'REPO', 'REPOS')}`,
    `SINCE ${new Date(user.createdAt).getUTCFullYear()}`,
  ];
  const chipWidths = chips.map((chip) => Math.ceil(measureCardText(chip, 17, 1)) + 36);
  const gap = 12;
  const chipsStart = 1112 - chipWidths.reduce((sum, w) => sum + w, 0) - gap * (chips.length - 1);
  let chipX = chipsStart;
  chips.forEach((chip, i) => {
    const w = chipWidths[i]!;
    parts.push(
      `<path d="${panel(chipX, 146, w, 32, { tl: 10, br: 10 })}" fill="${YELLOW}"/>`,
      text(chipX + w / 2, 168, chip, { size: 17, fill: BG, spacing: 1, anchor: 'middle' }),
    );
    chipX += w + gap;
  });
  const name = layoutHeroName(user);
  const nameStyle = {
    size: name.size,
    spacing: NAME_SPACING,
    font: 'display' as const,
    lead: true,
  };
  parts.push(
    `<g class="glitch"><g transform="translate(3 2)" opacity="0.6">${text(96, HERO_NAME.baseline, name.text, { ...nameStyle, fill: CYAN })}</g></g>`,
    text(96, HERO_NAME.baseline, name.text, { ...nameStyle, fill: YELLOW, filter: 'glow' }),
    text(98, 178, `@${user.login.toUpperCase()} · GITHUB`, { size: 17, fill: MUTED, spacing: 5 }),
  );

  // Sidebar: the eight biggest languages, with dim locked rows for the slots left over.
  parts.push(text(84, 222, 'LANGUAGES', label));
  const languages = metrics.languages.slice(0, ROW_COUNT);
  const topShare = languages[0]?.share || 1;
  for (let i = 0; i < ROW_COUNT; i++) {
    const y = 236 + i * 68;
    const language = languages[i];
    if (!language) {
      parts.push(
        `<rect x="84" y="${y}" width="288" height="56" fill="${ROW}" fill-opacity="0.45"/>`,
        `<rect x="100" y="${y + 16}" width="24" height="24" rx="6" fill="none" stroke="${MUTED}" stroke-opacity="0.35" stroke-width="2"/>`,
        lock(344, y + 20),
      );
      if (i === 0) {
        parts.push(text(140, y + 34, 'NO LANGUAGE DATA', { size: 16, fill: MUTED, spacing: 3 }));
      }
      continue;
    }
    const percent = language.share * 100;
    const colour = language.color ?? YELLOW;
    parts.push(
      `<g>`,
      `<rect x="84" y="${y}" width="288" height="56" fill="${i === 0 ? 'url(#rowActive)' : ROW}"/>`,
      `<rect x="368" y="${y}" width="4" height="56" fill="${i === 0 ? YELLOW : MUTED}" fill-opacity="${i === 0 ? 1 : 0.4}"/>`,
      `<rect x="100" y="${y + 16}" width="24" height="24" rx="6" fill="${colour}"/>`,
      text(140, y + 28, fit(language.name.toUpperCase(), 13), {
        size: 21,
        fill: i === 0 ? WHITE : SOFT,
        spacing: 3,
      }),
      text(352, y + 28, percent >= 1 ? `${Math.round(percent)}%` : '<1%', {
        size: 19,
        fill: MUTED,
        anchor: 'end',
      }),
      `<rect x="140" y="${y + 40}" width="200" height="4" fill="${YELLOW}" fill-opacity="0.15"/>`,
      `<rect x="140" y="${y + 40}" width="${((200 * language.share) / topShare).toFixed(1)}" height="4" fill="${colour}"/>`,
      `</g>`,
    );
  }

  // Centre panel: four headline rows with dashed dividers.
  parts.push(
    `<path d="${panel(410, 232, 350, 508, { tl: 46, br: 30 })}" fill="${PANEL}" stroke="${YELLOW}" stroke-opacity="0.5" stroke-width="1.4"/>`,
    `<polygon points="410,278 456,232 410,232" fill="${YELLOW}"/>`,
    `<rect class="pulse" x="520" y="229" width="200" height="6" fill="${YELLOW}" filter="url(#glow)"/>`,
  );
  const rows: { label: string; value: string; note?: string }[] = [
    { label: 'STARS EARNED', value: formatNumber(totals.stars) },
    { label: 'COMMITS · LAST 12 MONTHS', value: formatNumber(contributions.commits) },
    {
      label: 'PULL REQUESTS MERGED',
      value: stats ? formatNumber(stats.merged) : '—',
      note: stats ? `${formatNumber(stats.mergedAllTime)} ALL TIME` : undefined,
    },
    { label: 'MERGE RATE', value: rate === null ? '—' : `${Math.round(rate * 100)}%` },
  ];
  rows.forEach((row, i) => {
    const top = 250 + i * 118;
    parts.push(text(438, top + 26, row.label, label), text(438, top + 82, row.value, { size: 54 }));
    if (row.note) {
      parts.push(
        text(736, top + 82, row.note, { size: 17, fill: MUTED, spacing: 1, anchor: 'end' }),
      );
    }
    if (i < rows.length - 1) {
      const y = top + 104;
      parts.push(
        `<line x1="410" y1="${y}" x2="760" y2="${y}" stroke="${YELLOW}" stroke-opacity="0.3" stroke-dasharray="5 5"/>`,
        `<polygon points="410,${y - 7} 422,${y} 410,${y + 7}" fill="${YELLOW}"/>`,
      );
    }
  });

  // Dial: the merge rate, straddling the panel's corner.
  const dialX = 752;
  const dialY = 712;
  const offset = circumference * (1 - (rate ?? 0));
  parts.push(
    `<circle cx="${dialX}" cy="${dialY}" r="62" fill="${BG}" stroke="${YELLOW}" stroke-opacity="0.45" stroke-width="1.4"/>`,
    `<circle cx="${dialX}" cy="${dialY}" r="${TICK_RADIUS}" fill="none" stroke="${YELLOW}" stroke-opacity="0.35" stroke-width="5" stroke-dasharray="1.8 7.4"/>`,
    `<circle cx="${dialX}" cy="${dialY}" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-opacity="0.2" stroke-width="8"/>`,
    `<circle class="${rate === null ? '' : 'sweep'}" cx="${dialX}" cy="${dialY}" r="${DIAL_RADIUS}" fill="none" stroke="${YELLOW}" stroke-width="8" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 ${dialX} ${dialY})" filter="url(#glow)"/>`,
    text(dialX, dialY + 6, stats ? `${stats.merged}/${stats.opened}` : '—', {
      size: 18,
      anchor: 'middle',
    }),
  );

  // Character, in front of the rings.
  if (options.character) {
    const c = options.character;
    parts.push(
      `<g clip-path="url(#slot)" mask="url(#slotFade)"><image class="char" x="${HERO_SLOT.x}" y="${HERO_SLOT.y}" width="${Number(((c.frameWidth * c.frames) / (c.density ?? 1)).toFixed(3))}" height="${Number((c.frameHeight / (c.density ?? 1)).toFixed(3))}" href="${c.href}"/></g>`,
    );
  }

  // Streak box, over the character's legs: current and longest, and the last fortnight as bars.
  const recent = calendar.slice(-14);
  const peak = Math.max(1, ...recent.map((day) => day.count));
  const streak = String(streaks.current);
  parts.push(
    `<path d="${panel(868, 556, 264, 116, { tl: 30 })}" fill="${PANEL}" fill-opacity="0.88" stroke="${YELLOW}" stroke-opacity="0.5" stroke-width="1.4"/>`,
    bracket(900, 574, 1, 1),
    bracket(1116, 574, -1, 1),
    bracket(900, 660, 1, -1),
    bracket(1116, 660, -1, -1),
    text(916, 596, 'CURRENT STREAK', { size: 14, fill: YELLOW, spacing: 4 }),
    text(916, 646, streak, { size: 50 }),
    text(916 + measureCardText(streak, 50) + 10, 646, plural(streaks.current, 'DAY', 'DAYS'), {
      size: 16,
      fill: MUTED,
      spacing: 2,
    }),
    text(916, 664, `LONGEST ${streaks.longest} ${plural(streaks.longest, 'DAY', 'DAYS')}`, {
      size: 12,
      fill: MUTED,
      spacing: 1,
    }),
  );
  recent.forEach((day, i) => {
    const barHeight = 4 + (30 * day.count) / peak;
    parts.push(
      `<rect x="${(1040 + i * 5.6).toFixed(1)}" y="${648 - barHeight}" width="4" height="${barHeight.toFixed(1)}" fill="${YELLOW}" fill-opacity="${day.count > 0 ? 0.9 : 0.25}"/>`,
    );
  });

  // Pinned project strip, bottom right.
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
    `<path d="${panel(830, 708, 310, 86, { bl: 24, tr: 24 })}" fill="${ROW}" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4"/>`,
    `<rect x="1050" y="722" width="80" height="3" fill="${YELLOW}"/>`,
    `<rect x="1080" y="729" width="50" height="3" fill="${YELLOW}" fill-opacity="0.6"/>`,
    `<rect x="1065" y="736" width="65" height="3" fill="${YELLOW}" fill-opacity="0.35"/>`,
  );
  if (project) {
    parts.push(
      text(856, 738, project.tag, { size: 13, fill: YELLOW, spacing: 4 }),
      text(856, 776, fit(project.name, 18), { size: 28 }),
      text(1118, 776, `${formatNumber(project.stars)} ${plural(project.stars, 'STAR', 'STARS')}`, {
        size: 18,
        fill: MUTED,
        spacing: 2,
        anchor: 'end',
      }),
    );
  }

  // Reviews strip, bottom left of the centre panel.
  parts.push(
    `<path d="${panel(410, 758, 266, 38, { bl: 14, tr: 14 })}" fill="${ROW}" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4"/>`,
    text(430, 783, 'PR REVIEWS', { size: 13, fill: YELLOW, spacing: 4 }),
    text(654, 784, formatNumber(contributions.reviews), { size: 20, anchor: 'end' }),
  );

  // Footer: the last twelve weeks as squares, and the sync date.
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
  const busiest = Math.max(1, ...weeks);
  weeks.forEach((sum, i) => {
    parts.push(
      `<rect x="${84 + i * 18}" y="826" width="10" height="10" fill="${YELLOW}" fill-opacity="${(0.15 + (0.85 * sum) / busiest).toFixed(2)}"/>`,
    );
  });
  parts.push(
    text(312, 836, 'ACTIVITY · 12 WEEKS', { size: 13, fill: MUTED, spacing: 4 }),
    text(1128, 836, `SYNC ${metrics.generatedAt.slice(0, 10)}`, {
      size: 13,
      fill: MUTED,
      spacing: 3,
      anchor: 'end',
    }),
  );

  const title =
    `GitHub profile for ${user.login}: ` +
    `${formatNumber(totals.stars)} ${plural(totals.stars, 'star', 'stars')} and ` +
    `${formatNumber(contributions.commits)} ${plural(contributions.commits, 'commit', 'commits')} in the last year`;
  const characterStyle = options.character ? characterCss(options.character) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-labelledby="hero-title">
<title id="hero-title">${escapeXml(title)}</title>
<defs>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="glowTR" cx="88%" cy="16%" r="62%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.2"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<radialGradient id="glowBL" cx="6%" cy="96%" r="46%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.13"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<linearGradient id="rowActive" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.3"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0.02"/></linearGradient>
<clipPath id="frame"><path d="${frame}"/></clipPath>
<linearGradient id="slotFadeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0.78" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="slotFade" maskUnits="userSpaceOnUse" x="${HERO_SLOT.x}" y="${HERO_SLOT.y}" width="${HERO_SLOT.width}" height="${HERO_SLOT.height}"><rect x="${HERO_SLOT.x}" y="${HERO_SLOT.y}" width="${HERO_SLOT.width}" height="${HERO_SLOT.height}" fill="url(#slotFadeGrad)"/></mask>
<clipPath id="slot"><rect x="${HERO_SLOT.x}" y="${HERO_SLOT.y}" width="${HERO_SLOT.width}" height="${HERO_SLOT.height}"/></clipPath>
${glyphs.definitions()}
</defs>
<style>
.pulse{animation:pulse 2.6s ease-in-out infinite}
.sweep{animation:sweep 1.4s ease-out both}
.spin-a{transform-origin:${RING_X}px ${RING_Y}px;animation:spin 120s linear infinite}
.spin-b{transform-origin:${RING_X}px ${RING_Y}px;animation:spin 70s linear infinite reverse}
.glitch{animation:glitch 6s steps(1) infinite}
${characterStyle}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes sweep{from{stroke-dashoffset:${circumference.toFixed(2)}}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glitch{0%,94%,100%{transform:translate(0,0)}95%{transform:translate(5px,-1px)}97%{transform:translate(-4px,1px)}}
@media (prefers-reduced-motion:reduce){.pulse,.sweep,.spin-a,.spin-b,.glitch,.char{animation:none}}
</style>
${parts.join('\n')}
</svg>
`;
}
