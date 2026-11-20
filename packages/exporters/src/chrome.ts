import { CYBERPUNK, type Skin } from './skin';

/**
 * The neon HUD's page chrome: a solid background, a faint grid, glows along the two edges, and a
 * double rail down each side with rungs between. Cards drawn with it stack into one long page.
 *
 * Everything repeats every STEP units and nothing depends on where a piece sits vertically, so
 * pieces whose heights are multiples of STEP join without a seam, in any order. The first piece
 * of a stack takes a top cap, the last a bottom cap, and the rest none.
 */

export type Cap = 'top' | 'bottom' | 'both' | 'none';

export const STEP = 60;
const OUTER = 14;
const INNER = 28;
const CUT = 44;

export function chromeLayer(
  width: number,
  height: number,
  cap: Cap = 'none',
  skin: Skin = CYBERPUNK,
): string {
  const { accent: YELLOW, bg: BG } = skin.colors;
  const top = cap === 'top' || cap === 'both';
  const bottom = cap === 'bottom' || cap === 'both';
  const right = width - OUTER;
  const rightInner = width - INNER;
  const outerStart = top ? OUTER + CUT : 0;
  const outerEnd = bottom ? height - OUTER - CUT : height;
  const innerStart = top ? INNER + CUT : 0;
  const innerEnd = bottom ? height - INNER - CUT : height;

  const rails =
    `<path d="M${OUTER},${outerStart} V${outerEnd} M${right},${outerStart} V${outerEnd}" stroke-opacity="0.55" stroke-width="1.6"/>` +
    `<path d="M${INNER},${innerStart} V${innerEnd} M${rightInner},${innerStart} V${innerEnd}" stroke-opacity="0.22" stroke-width="1"/>`;

  const caps: string[] = [];
  if (top) {
    caps.push(
      `<path d="M${OUTER},${OUTER + CUT} L${OUTER + CUT},${OUTER} H${width - OUTER - CUT} L${right},${OUTER + CUT}" stroke-opacity="0.55" stroke-width="1.6"/>`,
      `<path d="M${INNER},${INNER + CUT} L${INNER + CUT},${INNER} H${width - INNER - CUT} L${rightInner},${INNER + CUT}" stroke-opacity="0.22" stroke-width="1"/>`,
    );
  }
  if (bottom) {
    const yo = height - OUTER;
    const yi = height - INNER;
    caps.push(
      `<path d="M${OUTER},${yo - CUT} L${OUTER + CUT},${yo} H${width - OUTER - CUT} L${right},${yo - CUT}" stroke-opacity="0.55" stroke-width="1.6"/>`,
      `<path d="M${INNER},${yi - CUT} L${INNER + CUT},${yi} H${width - INNER - CUT} L${rightInner},${yi - CUT}" stroke-opacity="0.22" stroke-width="1"/>`,
    );
  }

  const rungs: string[] = [];
  const first = top ? Math.ceil((OUTER + CUT) / STEP) * STEP : 0;
  const last = bottom ? height - OUTER - CUT : height;
  for (let y = first; y < last; y += STEP) {
    rungs.push(
      `<rect x="${OUTER}" y="${y}" width="${INNER - OUTER}" height="1.6"/>`,
      `<rect x="${width - INNER}" y="${y}" width="${INNER - OUTER}" height="1.6"/>`,
    );
  }

  const bars: string[] = [];
  if (top) {
    bars.push(
      `<rect class="rail-pulse" x="92" y="9" width="240" height="7" fill="${YELLOW}" filter="url(#chromeGlow)"/>`,
    );
  }
  if (bottom) {
    bars.push(
      `<rect class="rail-pulse" x="${width - 332}" y="${height - 16}" width="240" height="7" fill="${YELLOW}" filter="url(#chromeGlow)"/>`,
    );
  }

  return `<defs>
<linearGradient id="edgeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></linearGradient>
<linearGradient id="edgeR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.16"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></linearGradient>
<pattern id="grid" width="${STEP}" height="${STEP}" patternUnits="userSpaceOnUse"><path d="M${STEP},0 H0 V${STEP}" fill="none" stroke="${YELLOW}" stroke-opacity="0.035"/></pattern>
<filter id="chromeGlow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<style>.rail-pulse{animation:railpulse 2.6s ease-in-out infinite}@keyframes railpulse{0%,100%{opacity:1}50%{opacity:.55}}@media (prefers-reduced-motion:reduce){.rail-pulse{animation:none}}</style>
<rect width="${width}" height="${height}" fill="${BG}"/>
<rect width="260" height="${height}" fill="url(#edgeL)"/>
<rect x="${width - 260}" width="260" height="${height}" fill="url(#edgeR)"/>
<rect width="${width}" height="${height}" fill="url(#grid)"/>
<g fill="none" stroke="${YELLOW}">${rails}${caps.join('')}</g>
<g fill="${YELLOW}" fill-opacity="0.4">${rungs.join('')}</g>
${bars.join('\n')}`;
}
