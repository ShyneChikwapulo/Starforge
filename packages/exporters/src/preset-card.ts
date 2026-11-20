import type { Metrics } from '@starforge/github-data';
import { GlyphSet, drawText, escapeXml, measureCardText, type DrawTextStyle } from './card-text';
import { formatNumber, plural } from './hud';
import { resolveSkin, type Skin, type SkinName } from './skin';
import { chromeLayer, type Cap } from './chrome';

/**
 * A preset's animation inside the neon HUD: a title bar with your headline numbers, a window with
 * the animation in it, and the legend as HUD chips. Everything but the animation is vector
 * outlines and plain CSS, and the animation is embedded, so a card is one self-contained SVG.
 * Cards are all 1200 units wide and as tall as their content, rounded up to a multiple of GRID,
 * so a stack of them shares one rhythm.
 */

const VIEW_WIDTH = 1200;
const PAD = 48;
const CONTENT = VIEW_WIDTH - 2 * PAD;
const GRID = 60;
const TOP = 148;

/** The parts of a preset a card needs. */
export interface PresetCardPreset {
  id: string;
  name: string;
  /** "Key: meaning · Key: meaning", as in the legend strip. */
  caption: string;
}

/** The animation, as a data URI (or URL) of an animated WebP, and its pixel size. */
export interface PresetCardMedia {
  href: string;
  width: number;
  height: number;
}

export interface PresetCardOptions {
  preset: PresetCardPreset;
  media: PresetCardMedia;
  /**
   * "wide" puts the animation across the card with the legend under it; "side" puts a legend
   * panel beside it. Default: wide for media at least 1.6 times wider than tall.
   */
  layout?: 'wide' | 'side';
  /** Pixel width. The height follows the content. Default 1200. */
  width?: number;
  /**
   * Draw as one piece of a stack of cards: the page chrome's continuous rails instead of a closed
   * frame. Default: a standalone card with its own frame.
   */
  stack?: Cap;
  /** The look of the card. Default: cyberpunk. */
  skin?: SkinName | Skin;
}

type Style = Omit<DrawTextStyle, 'fill'> & { fill?: string };

/** Uppercase, and only the characters the baked font has. */
const clean = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e\u00b7\u2014\u2026]/g, '')
    .toUpperCase();

const shortName = (name: string): string => {
  const c = clean(name);
  return c.length > 12 ? `${c.slice(0, 11)}…` : c;
};

const percentText = (share: number): string =>
  share >= 0.01 ? `${Math.round(share * 100)}%` : '<1%';

export interface CaptionSegment {
  key: string;
  meaning: string;
}

/** "Arms: languages · Stars: repositories" becomes two segments. */
export function captionSegments(caption: string): CaptionSegment[] {
  return caption.split(' · ').map((part) => {
    const at = part.indexOf(': ');
    return at < 0
      ? { key: '', meaning: clean(part) }
      : { key: clean(part.slice(0, at)), meaning: clean(part.slice(at + 2)) };
  });
}

function wrap(text: string, size: number, spacing: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureCardText(next, size, spacing) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function weeklyTotals(calendar: { count: number }[], weeks: number): number[] {
  const days = calendar.slice(-weeks * 7);
  const padding = weeks * 7 - days.length;
  const totals: number[] = [];
  for (let w = 0; w < weeks; w++) {
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const index = w * 7 + d - padding;
      if (index >= 0) sum += days[index]?.count ?? 0;
    }
    totals.push(sum);
  }
  return totals;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function renderPresetCardSvg(metrics: Metrics, options: PresetCardOptions): string {
  const { preset, media } = options;
  const width = options.width ?? VIEW_WIDTH;
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
  const squares = (x: number, y: number, totals: number[]): string => {
    const busiest = Math.max(1, ...totals);
    return totals
      .map(
        (sum, i) =>
          `<rect x="${x + i * 18}" y="${y}" width="10" height="10" fill="${YELLOW}" fill-opacity="${(0.15 + (0.85 * sum) / busiest).toFixed(2)}"/>`,
      )
      .join('');
  };
  const bracket = (x: number, y: number, sx: number, sy: number): string =>
    `<path d="M${x},${y + sy * 18} V${y} H${x + sx * 18}" fill="none" stroke="${YELLOW}" stroke-width="2" stroke-opacity="0.85"/>`;
  const layout = options.layout ?? (media.width / media.height >= 1.6 ? 'wide' : 'side');
  const login = metrics.user.login;
  const segments = captionSegments(preset.caption);
  const totals = weeklyTotals(metrics.contributions.calendar, 12);
  const date = metrics.generatedAt.slice(0, 10);

  const glyphs = new GlyphSet();
  const text = (x: number, y: number, content: string, style: Style): string =>
    drawText(glyphs, x, y, content, { ...style, fill: style.fill ?? WHITE });
  const label: Style = { size: 14, fill: YELLOW, spacing: 4 };
  const parts: string[] = [];

  // Title bar: the preset's name and three headline numbers.
  parts.push(
    `<path d="${panel(PAD, 40, CONTENT, 84, { tl: 24, br: 24 })}" fill="${PANEL}" fill-opacity="0.85" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4"/>`,
    `<rect class="pulse" x="${PAD + 16}" y="58" width="6" height="48" fill="${YELLOW}" filter="url(#glow)"/>`,
    text(PAD + 40, 90, clean(preset.name), { size: 40, spacing: 6, fill: YELLOW, filter: 'glow' }),
    text(PAD + 42, 112, `@${clean(login)} · LAST 12 MONTHS`, {
      size: 14,
      fill: MUTED,
      spacing: 4,
    }),
  );
  const { commits } = metrics.contributions;
  const chips = [
    `${formatNumber(commits)} ${plural(commits, 'COMMIT', 'COMMITS')}`,
    `${formatNumber(metrics.totals.repositories)} ${plural(metrics.totals.repositories, 'REPO', 'REPOS')}`,
    `${formatNumber(metrics.totals.stars)} ${plural(metrics.totals.stars, 'STAR', 'STARS')}`,
  ];
  const chipWidths = chips.map((chip) => Math.ceil(measureCardText(chip, 15, 1)) + 30);
  let chipX = PAD + CONTENT - 24 - chipWidths.reduce((sum, w) => sum + w, 0) - 10 * 2;
  chips.forEach((chip, i) => {
    const w = chipWidths[i]!;
    parts.push(
      `<path d="${panel(chipX, 62, w, 32, { tl: 9, br: 9 })}" fill="${YELLOW}"/>`,
      text(chipX + w / 2, 84, chip, { size: 15, fill: BG, spacing: 1, anchor: 'middle' }),
    );
    chipX += w + 10;
  });

  // The animation's window: clipped to a cut-corner shape, with scanlines and a vignette over it.
  let win: Box = { x: PAD, y: TOP, w: CONTENT, h: 0 };
  const windowParts = (box: Box): string[] => [
    `<g clip-path="url(#win)">`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${BG}"/>`,
    `<image x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid slice" href="${media.href}"/>`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#scan)"/>`,
    `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#vignette)"/>`,
    `</g>`,
    `<path d="${panel(box.x, box.y, box.w, box.h, { tl: 22, br: 22 })}" fill="none" stroke="${YELLOW}" stroke-opacity="0.55" stroke-width="1.6"/>`,
    bracket(box.x + 36, box.y + 14, 1, 1),
    bracket(box.x + box.w - 14, box.y + 14, -1, 1),
    bracket(box.x + 14, box.y + box.h - 14, 1, -1),
    bracket(box.x + box.w - 36, box.y + box.h - 14, -1, -1),
    `<circle class="live" cx="${box.x + 58}" cy="${box.y + 38}" r="5" fill="${YELLOW}"/>`,
    text(box.x + 72, box.y + 43, 'LIVE', { size: 13, fill: YELLOW, spacing: 4 }),
  ];

  let contentBottom: number;
  if (layout === 'wide') {
    const mediaH = Math.round((CONTENT * media.height) / media.width);
    win = { x: PAD, y: TOP, w: CONTENT, h: mediaH };
    parts.push(...windowParts(win));

    let y = TOP + mediaH + 28;
    let x = PAD;
    for (const segment of segments) {
      const keyWidth = segment.key ? Math.ceil(measureCardText(segment.key, 14, 3)) : 0;
      const meaningWidth = Math.ceil(measureCardText(segment.meaning, 14, 1));
      const w = 36 + keyWidth + (segment.key ? 12 : 0) + meaningWidth;
      if (x > PAD && x + w > PAD + CONTENT) {
        x = PAD;
        y += 44;
      }
      parts.push(
        `<path d="${panel(x, y, w, 34, { tl: 8, br: 8 })}" fill="${ROW}" stroke="${YELLOW}" stroke-opacity="0.3" stroke-width="1.2"/>`,
      );
      let tx = x + 18;
      if (segment.key) {
        parts.push(text(tx, y + 23, segment.key, { size: 14, fill: YELLOW, spacing: 3 }));
        tx += keyWidth + 12;
      }
      parts.push(text(tx, y + 23, segment.meaning, { size: 14, fill: SOFT, spacing: 1 }));
      x += w + 12;
    }
    y += 34 + 22;

    const languages = metrics.languages.slice(0, 6);
    if (languages.length > 0) {
      parts.push(text(PAD, y + 20, 'LANGUAGES', { size: 13, fill: YELLOW, spacing: 4 }));
      let lx = PAD + Math.ceil(measureCardText('LANGUAGES', 13, 4)) + 28;
      for (const language of languages) {
        const name = shortName(language.name);
        const pct = percentText(language.share);
        const nameWidth = Math.ceil(measureCardText(name, 14, 1));
        const w = 24 + nameWidth + 10 + Math.ceil(measureCardText(pct, 14));
        if (lx + w > PAD + CONTENT) {
          lx = PAD;
          y += 38;
        }
        parts.push(
          `<rect x="${lx}" y="${y + 6}" width="14" height="14" rx="4" fill="${language.color ?? YELLOW}"/>`,
          text(lx + 24, y + 20, name, { size: 14, spacing: 1 }),
          text(lx + 24 + nameWidth + 10, y + 20, pct, { size: 14, fill: MUTED }),
        );
        lx += w + 18;
      }
      y += 38;
    }

    parts.push(
      squares(PAD, y + 4, totals),
      text(PAD + 12 * 18 + 16, y + 14, 'ACTIVITY · 12 WEEKS', {
        size: 13,
        fill: MUTED,
        spacing: 4,
      }),
      text(PAD + CONTENT, y + 14, `SYNC ${date}`, {
        size: 13,
        fill: MUTED,
        spacing: 3,
        anchor: 'end',
      }),
    );
    contentBottom = y + 24;
  } else {
    const panelW = 380;
    const mediaX = PAD + panelW + 24;
    const mediaW = PAD + CONTENT - mediaX;
    const mediaH = Math.round((mediaW * media.height) / media.width);
    const px = PAD + 26;
    const inner = panelW - 52;
    const side: string[] = [];

    let y = TOP + 40;
    side.push(text(px, y, 'ENCODING', label));
    y += 34;
    for (const segment of segments) {
      if (segment.key) {
        side.push(text(px, y, segment.key, { size: 20, fill: YELLOW, spacing: 3 }));
        y += 26;
      }
      for (const line of wrap(segment.meaning, 15, 1, inner)) {
        side.push(text(px, y, line, { size: 15, fill: SOFT, spacing: 1 }));
        y += 21;
      }
      y += 16;
    }
    side.push(
      `<line x1="${px}" y1="${y - 4}" x2="${px + inner}" y2="${y - 4}" stroke="${YELLOW}" stroke-opacity="0.3" stroke-dasharray="5 5"/>`,
    );
    y += 26;

    const languages = metrics.languages.slice(0, 5);
    if (languages.length > 0) {
      side.push(text(px, y, 'LANGUAGES', label));
      y += 30;
      const top = languages[0]!.share || 1;
      for (const language of languages) {
        const colour = language.color ?? YELLOW;
        const barWidth = inner - 24;
        side.push(
          `<rect x="${px}" y="${y - 14}" width="14" height="14" rx="4" fill="${colour}"/>`,
          text(px + 24, y, shortName(language.name), { size: 17, spacing: 2 }),
          text(px + inner, y, percentText(language.share), {
            size: 16,
            fill: MUTED,
            anchor: 'end',
          }),
          `<rect x="${px + 24}" y="${y + 8}" width="${barWidth}" height="3" fill="${YELLOW}" fill-opacity="0.15"/>`,
          `<rect x="${px + 24}" y="${y + 8}" width="${((barWidth * language.share) / top).toFixed(1)}" height="3" fill="${colour}"/>`,
        );
        y += 40;
      }
    }
    side.push(
      squares(px, y, totals),
      text(px, y + 36, `SYNC ${date}`, { size: 13, fill: MUTED, spacing: 3 }),
    );
    y += 56;

    const bodyH = Math.max(mediaH, y - TOP + 8);
    const extra = bodyH - (y - TOP + 8);
    if (extra > 0) {
      const tail = side.splice(-2);
      side.push(`<g transform="translate(0 ${extra})">${tail.join('')}</g>`);
    }
    parts.push(
      `<path d="${panel(PAD, TOP, panelW, bodyH, { tl: 30, br: 30 })}" fill="${PANEL}" fill-opacity="0.9" stroke="${YELLOW}" stroke-opacity="0.45" stroke-width="1.4"/>`,
      ...side,
    );
    win = { x: mediaX, y: TOP + Math.round((bodyH - mediaH) / 2), w: mediaW, h: mediaH };
    parts.push(...windowParts(win));
    contentBottom = TOP + bodyH;
  }

  const height = Math.ceil((contentBottom + 40) / GRID) * GRID;
  const frame = panel(12, 12, VIEW_WIDTH - 24, height - 24, { tl: 44, br: 44 });
  const backdrop = options.stack
    ? chromeLayer(VIEW_WIDTH, height, options.stack, skin)
    : [
        `<rect width="${VIEW_WIDTH}" height="${height}" fill="${BG}"/>`,
        `<rect width="${VIEW_WIDTH}" height="${height}" fill="url(#glowTR)"/>`,
        `<rect width="${VIEW_WIDTH}" height="${height}" fill="url(#glowBL)"/>`,
        `<path d="${frame}" fill="none" stroke="${YELLOW}" stroke-opacity="0.55" stroke-width="1.6"/>`,
        `<rect class="pulse" x="92" y="9" width="240" height="7" fill="${YELLOW}" filter="url(#glow)"/>`,
      ].join('\n');
  const title = `${preset.name} view of ${login}'s last 12 months of GitHub activity`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * height) / VIEW_WIDTH)}" viewBox="0 0 ${VIEW_WIDTH} ${height}" role="img" aria-labelledby="preset-title">
<title id="preset-title">${escapeXml(title)}</title>
<defs>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="glowTR" cx="88%" cy="10%" r="60%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.18"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<radialGradient id="glowBL" cx="6%" cy="96%" r="50%"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.12"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
<pattern id="scan" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="#000" fill-opacity="0.16"/></pattern>
<clipPath id="win"><path d="${panel(win.x, win.y, win.w, win.h, { tl: 22, br: 22 })}"/></clipPath>
${glyphs.definitions()}
</defs>
<style>
.pulse{animation:pulse 2.6s ease-in-out infinite}
.live{animation:live 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes live{0%,100%{opacity:1}50%{opacity:.2}}
@media (prefers-reduced-motion:reduce){.pulse,.live{animation:none}}
</style>
${backdrop}
${parts.join('\n')}
</svg>
`;
}
