import type { Metrics } from '@starforge/github-data';
import { GlyphSet, drawText, escapeXml, measureCardText } from './card-text';
import { chromeLayer } from './chrome';
import { BG, MUTED, PANEL, YELLOW, panel } from './hud';

/**
 * The two small pieces that finish a stack of cards: a section divider that breaks a page into
 * parts, and a footer with the bottom cap. Both are as tall as a multiple of the chrome's STEP.
 */

const VIEW_WIDTH = 1200;
const PAD = 48;
const CONTENT = VIEW_WIDTH - 2 * PAD;

const clean = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e\u00b7\u2014\u2026]/g, '')
    .toUpperCase();

const frame = (width: number, height: number, label: string, body: string, defs: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * height) / VIEW_WIDTH)}" viewBox="0 0 ${VIEW_WIDTH} ${height}" role="img" aria-label="${escapeXml(label)}">
<title>${escapeXml(label)}</title>
<defs>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
${defs}
</defs>
${body}
</svg>
`;

export interface SectionOptions {
  /** Pixel width. The height follows the shape. Default 1200. */
  width?: number;
  /** A few words, right-aligned above the rule. */
  subtitle?: string;
}

/** A divider: chevrons, a title in neon capitals and a rule running to the right edge. */
export function renderSectionSvg(title: string, options: SectionOptions = {}): string {
  const height = 120;
  const glyphs = new GlyphSet();
  const name = clean(title);
  const size = 34;
  const spacing = 6;
  const textX = PAD + 56;
  const ruleStart = textX + Math.ceil(measureCardText(name, size, spacing)) + 28;
  const parts = [
    chromeLayer(VIEW_WIDTH, height, 'none'),
    `<polygon points="${PAD + 8},42 ${PAD + 24},60 ${PAD + 8},78 ${PAD + 8},68 ${PAD + 14},60 ${PAD + 8},52" fill="${YELLOW}"/>`,
    `<polygon points="${PAD + 26},42 ${PAD + 42},60 ${PAD + 26},78 ${PAD + 26},68 ${PAD + 32},60 ${PAD + 26},52" fill="${YELLOW}" fill-opacity="0.45"/>`,
    drawText(glyphs, textX, 72, name, { size, fill: YELLOW, spacing, filter: 'glow' }),
    `<line x1="${ruleStart}" y1="60" x2="${PAD + CONTENT - 16}" y2="60" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4" stroke-dasharray="6 6"/>`,
    `<polygon points="${PAD + CONTENT},60 ${PAD + CONTENT - 8},52 ${PAD + CONTENT - 16},60 ${PAD + CONTENT - 8},68" fill="${YELLOW}"/>`,
  ];
  if (options.subtitle) {
    parts.push(
      drawText(glyphs, PAD + CONTENT, 46, clean(options.subtitle), {
        size: 14,
        fill: MUTED,
        spacing: 4,
        anchor: 'end',
      }),
    );
  }
  return frame(
    options.width ?? VIEW_WIDTH,
    height,
    `Section: ${title}`,
    parts.join('\n'),
    glyphs.definitions(),
  );
}

export interface FooterOptions {
  /** Pixel width. The height follows the shape. Default 1200. */
  width?: number;
}

/** The last piece of a stack: a credit strip, the sync date, and the bottom cap. */
export function renderFooterSvg(metrics: Metrics, options: FooterOptions = {}): string {
  const height = 180;
  const glyphs = new GlyphSet();
  const text = (x: number, y: number, content: string, size: number, fill: string, spacing = 3) =>
    drawText(glyphs, x, y, content, { size, fill, spacing });
  const brand = 'STARFORGE';
  const chipWidth = Math.ceil(measureCardText(brand, 16, 3)) + 36;
  const squares = Array.from({ length: 12 }, (_, i) => {
    const x = (VIEW_WIDTH - (12 * 18 - 8)) / 2 + i * 18;
    return `<rect x="${x}" y="128" width="10" height="10" fill="${YELLOW}" fill-opacity="${(0.2 + (0.8 * (i + 1)) / 12).toFixed(2)}"/>`;
  }).join('');
  const parts = [
    chromeLayer(VIEW_WIDTH, height, 'bottom'),
    `<path d="${panel(PAD, 40, CONTENT, 64, { tl: 18, br: 18 })}" fill="${PANEL}" fill-opacity="0.85" stroke="${YELLOW}" stroke-opacity="0.4" stroke-width="1.4"/>`,
    `<path d="${panel(PAD + 20, 56, chipWidth, 32, { tl: 9, br: 9 })}" fill="${YELLOW}"/>`,
    drawText(glyphs, PAD + 20 + chipWidth / 2, 78, brand, {
      size: 16,
      fill: BG,
      spacing: 3,
      anchor: 'middle',
    }),
    text(PAD + 20 + chipWidth + 22, 78, 'OPEN-SOURCE GITHUB PROFILE VISUALS', 14, MUTED, 4),
    drawText(
      glyphs,
      PAD + CONTENT - 24,
      78,
      `@${clean(metrics.user.login)} · SYNC ${metrics.generatedAt.slice(0, 10)}`,
      { size: 14, fill: MUTED, spacing: 3, anchor: 'end' },
    ),
    squares,
  ];
  return frame(
    options.width ?? VIEW_WIDTH,
    height,
    `Starforge footer for ${metrics.user.login}`,
    parts.join('\n'),
    glyphs.definitions(),
  );
}
