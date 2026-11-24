import type { Metrics } from '@starforge/github-data';
import { GlyphSet, drawText, escapeXml, measureCardText } from './card-text';
import { chromeLayer, type Cap } from './chrome';
import { heatmapCard } from './info-heatmap';
import {
  CONTENT,
  INFO_CARD_IDS,
  PAD,
  clean,
  wrap,
  type InfoCardDef,
  type InfoCardId,
  type InfoCtx,
  type InfoTextStyle,
} from './info-kit';
import { languagesCard } from './info-languages';
import { openSourceCard } from './info-opensource';
import { rhythmCard } from './info-rhythm';
import { chipStyle, edgeAttrs, resolveSkin, trackAttrs, type Skin, type SkinName } from './skin';

export { INFO_CARD_IDS, type InfoCardId };

/**
 * Info cards: plain cards made of numbers, bars and grids, with no animation. Each is drawn in a
 * frame like the preset cards (a title bar with headline chips, then the card's body, then a legend
 * saying what the numbers mean), in any skin, and stacks into a page like the other pieces. They
 * are small, which is the point: a README can hold several.
 */

const VIEW_WIDTH = 1200;
const GRID = 60;
const TOP = 148;

const CARDS: Record<InfoCardId, InfoCardDef> = {
  languages: languagesCard,
  heatmap: heatmapCard,
  opensource: openSourceCard,
  rhythm: rhythmCard,
};

export interface InfoCardOptions {
  card: InfoCardId;
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

export function renderInfoCardSvg(metrics: Metrics, options: InfoCardOptions): string {
  const def = CARDS[options.card];
  if (!def) throw new Error(`Unknown info card "${options.card}"`);
  const width = options.width ?? VIEW_WIDTH;
  const skin = resolveSkin(options.skin);
  const {
    accent: ACCENT,
    bg: BG,
    panel: PANEL,
    row: ROW,
    text: WHITE,
    muted: MUTED,
    soft: SOFT,
  } = skin.colors;
  const TITLE = skin.colors.title ?? ACCENT;
  const LABEL = skin.colors.label ?? ACCENT;
  const panel = skin.shape;
  const { ornaments, glow } = skin;
  const edge = (opacity: number): string => edgeAttrs(skin, opacity);
  const track = (opacity: number): string => trackAttrs(skin, opacity);
  const chipTheme = chipStyle(skin);
  const login = metrics.user.login;
  const date = metrics.generatedAt.slice(0, 10);

  const glyphs = new GlyphSet();
  const text = (x: number, y: number, content: string, style: InfoTextStyle): string =>
    drawText(glyphs, x, y, content, { ...style, fill: style.fill ?? WHITE });
  const ctx: InfoCtx = {
    metrics,
    skin,
    colors: {
      accent: ACCENT,
      bg: BG,
      panel: PANEL,
      row: ROW,
      text: WHITE,
      muted: MUTED,
      soft: SOFT,
      title: TITLE,
      label: LABEL,
    },
    text,
    edge,
    track,
  };

  const parts: string[] = [];

  // Title bar: the card's name, what it covers, and up to three headline numbers.
  parts.push(
    `<path d="${panel(PAD, 40, CONTENT, 84, { tl: 24, br: 24 })}" fill="${PANEL}" fill-opacity="0.85" ${edge(0.4)} stroke-width="1.4"/>`,
    ...(ornaments
      ? [
          `<rect class="pulse" x="${PAD + 16}" y="58" width="6" height="48" fill="${ACCENT}" filter="url(#glow)"/>`,
        ]
      : []),
    text(PAD + 40, 90, clean(def.title), {
      size: 40,
      spacing: 6,
      fill: TITLE,
      filter: glow ? 'glow' : undefined,
    }),
    text(PAD + 42, 112, def.subtitle(metrics), { size: 14, fill: MUTED, spacing: 4 }),
  );
  const chips = def.chips(metrics).slice(0, 3).map(clean);
  const chipWidths = chips.map((chip) => Math.ceil(measureCardText(chip, 15, 1)) + 30);
  let chipX =
    PAD +
    CONTENT -
    24 -
    chipWidths.reduce((sum, w) => sum + w, 0) -
    10 * Math.max(0, chips.length - 1);
  chips.forEach((chip, i) => {
    const w = chipWidths[i]!;
    parts.push(
      `<path d="${panel(chipX, 62, w, 32, { tl: 9, br: 9 })}" fill="${chipTheme.fill}"${chipTheme.stroke ? ` stroke="${chipTheme.stroke}"` : ''}/>`,
      text(chipX + w / 2, 84, chip, {
        size: 15,
        fill: chipTheme.text,
        spacing: 1,
        anchor: 'middle',
      }),
    );
    chipX += w + 10;
  });

  // Body, then the legend under a dashed rule.
  const body = def.body(ctx, TOP);
  parts.push(...body.parts);
  const ruleY = TOP + body.height + 14;
  parts.push(
    `<line x1="${PAD}" y1="${ruleY}" x2="${PAD + CONTENT}" y2="${ruleY}" ${edge(0.3)} stroke-dasharray="5 5"/>`,
  );
  const legendY = ruleY + 28;
  const lines = wrap(clean(def.legend(metrics)), 13, 1, CONTENT - 240).slice(0, 3);
  lines.forEach((line, i) => {
    parts.push(text(PAD, legendY + i * 20, line, { size: 13, fill: MUTED, spacing: 1 }));
  });
  parts.push(
    text(PAD + CONTENT, legendY, `SYNC ${date}`, {
      size: 13,
      fill: MUTED,
      spacing: 3,
      anchor: 'end',
    }),
  );
  const contentBottom = legendY + Math.max(0, lines.length - 1) * 20;
  const height = Math.ceil((contentBottom + 56) / GRID) * GRID;

  const frame = panel(12, 12, VIEW_WIDTH - 24, height - 24, { tl: 44, br: 44 });
  const backdrop = options.stack
    ? chromeLayer(VIEW_WIDTH, height, options.stack, skin)
    : [
        `<rect width="${VIEW_WIDTH}" height="${height}" fill="${BG}"/>`,
        ...(glow
          ? [
              `<rect width="${VIEW_WIDTH}" height="${height}" fill="url(#glowTR)"/>`,
              `<rect width="${VIEW_WIDTH}" height="${height}" fill="url(#glowBL)"/>`,
            ]
          : []),
        `<path d="${frame}" fill="none" ${edge(0.55)} stroke-width="1.6"/>`,
        ...(ornaments
          ? [
              `<rect class="pulse" x="92" y="9" width="240" height="7" fill="${ACCENT}" filter="url(#glow)"/>`,
            ]
          : []),
      ].join('\n');
  const title = `${def.title} for ${login}, from GitHub data`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * height) / VIEW_WIDTH)}" viewBox="0 0 ${VIEW_WIDTH} ${height}" role="img" aria-labelledby="info-title">
<title id="info-title">${escapeXml(title)}</title>
<defs>
${glow ? `<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
${glow ? `<radialGradient id="glowTR" cx="88%" cy="10%" r="60%"><stop offset="0" stop-color="${ACCENT}" stop-opacity="0.18"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>` : ''}
${glow ? `<radialGradient id="glowBL" cx="6%" cy="96%" r="50%"><stop offset="0" stop-color="${ACCENT}" stop-opacity="0.12"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>` : ''}
${glyphs.definitions()}
</defs>
<style>
.pulse{animation:pulse 2.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.pulse{animation:none}}
</style>
${backdrop}
${parts.join('\n')}
</svg>
`;
}
