/**
 * Bakes glyph outlines for the display font: the capitals and a space, used for big titles such as
 * the hero card's name. Like the card font, they are vector outlines, so a card looks the same on
 * every machine. Characters this font lacks are drawn with the card font's glyphs.
 *
 *   pnpm exec tsx scripts/bake-display-font.ts <font.ttf> --source=URL --author=NAME
 *     [--label=NAME] [--gap=0] [--lead=1.3]
 *
 * Writes packages/exporters/src/display-font-data.ts. The source and the author go into its header
 * and into THIRD_PARTY_NOTICES.md, so both are required. `--preview` writes the file without them,
 * for a look on your own machine only: never commit that.
 *
 * Each letter is trimmed to its ink and then kerned to the shapes of its neighbours. For every
 * pair of capitals both outlines are sliced into thin horizontal bands, and the second letter is
 * moved as far left as it can go until the two would come closer than --gap font units in some
 * band. A tail tucks under the next letter's arm, a bowl sits over the last one's foot, wherever
 * the shapes leave room. --gap 0 means the outlines just touch; a negative gap lets them overlap,
 * which merges into one solid shape. Fonts made from handwriting carry wide, uneven margins that a
 * box-based spacing cannot fix, which is why this works from the outlines.
 *
 * The first letter of a word can be drawn --lead times larger. A larger letter is a different
 * shape, so it gets its own kerning table, worked out from the outline at that size.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'packages', 'exporters', 'src', 'display-font-data.ts');
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const CHARACTERS = [' ', ...LETTERS];
/** Height of a slice, in font units, when comparing two outlines. */
const BAND = 20;

interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface Glyph {
  advanceWidth?: number;
  path: { commands: PathCommand[] };
  getBoundingBox(): { x1: number; x2: number; y1: number; y2: number };
}

/** SVG path data in whole font units, moved left by `shift`, with y flipped so it stands upright. */
function toPath(commands: PathCommand[], shift: number): string {
  const x = (v: number | undefined): number => Math.round((v ?? 0) - shift);
  const y = (v: number | undefined): number => -Math.round(v ?? 0);
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M':
          return `M${x(c.x)} ${y(c.y)}`;
        case 'L':
          return `L${x(c.x)} ${y(c.y)}`;
        case 'Q':
          return `Q${x(c.x1)} ${y(c.y1)} ${x(c.x)} ${y(c.y)}`;
        case 'C':
          return `C${x(c.x1)} ${y(c.y1)} ${x(c.x2)} ${y(c.y2)} ${x(c.x)} ${y(c.y)}`;
        case 'Z':
          return 'Z';
        default:
          return '';
      }
    })
    .join('');
}

/** Points along an outline, close enough together that none skips over a band. */
function flatten(commands: PathCommand[]): [number, number][] {
  const points: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const line = (x: number, y: number): void => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / 6));
    for (let i = 1; i <= steps; i++) {
      points.push([cx + ((x - cx) * i) / steps, cy + ((y - cy) * i) / steps]);
    }
    cx = x;
    cy = y;
  };
  for (const c of commands) {
    if (c.type === 'M') {
      cx = sx = c.x ?? 0;
      cy = sy = c.y ?? 0;
      points.push([cx, cy]);
    } else if (c.type === 'L') {
      line(c.x ?? 0, c.y ?? 0);
    } else if (c.type === 'Q') {
      const [x1, y1, x, y] = [c.x1 ?? 0, c.y1 ?? 0, c.x ?? 0, c.y ?? 0];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const u = 1 - t;
        points.push([
          u * u * cx + 2 * u * t * x1 + t * t * x,
          u * u * cy + 2 * u * t * y1 + t * t * y,
        ]);
      }
      cx = x;
      cy = y;
    } else if (c.type === 'C') {
      const [x1, y1, x2, y2, x, y] = [
        c.x1 ?? 0,
        c.y1 ?? 0,
        c.x2 ?? 0,
        c.y2 ?? 0,
        c.x ?? 0,
        c.y ?? 0,
      ];
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        points.push([
          u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        ]);
      }
      cx = x;
      cy = y;
    } else if (c.type === 'Z') {
      line(sx, sy);
    }
  }
  return points;
}

/** For each horizontal band, the leftmost and rightmost ink of a glyph, left edge moved to 0. */
interface Profile {
  min: Map<number, number>;
  max: Map<number, number>;
  ink: number;
}

/** A glyph's profile, drawn `scale` times larger about its baseline and left edge. */
function profileOf(glyph: Glyph, scale = 1): Profile {
  const box = glyph.getBoundingBox();
  const min = new Map<number, number>();
  const max = new Map<number, number>();
  for (const [px, py] of flatten(glyph.path.commands)) {
    const band = Math.floor((py * scale) / BAND);
    const x = (px - box.x1) * scale;
    min.set(band, Math.min(min.get(band) ?? Infinity, x));
    max.set(band, Math.max(max.get(band) ?? -Infinity, x));
  }
  return { min, max, ink: Math.round((box.x2 - box.x1) * scale) };
}

/** Where the right letter's origin may sit, so its outline keeps `gap` clear of the left's. */
function distance(left: Profile, right: Profile, gap: number): number {
  let best = -Infinity;
  for (const [band, edge] of left.max) {
    const start = right.min.get(band);
    if (start !== undefined) best = Math.max(best, edge - start + gap);
  }
  // Letters that share no height cannot collide; keep them from sliding fully over each other.
  if (best === -Infinity) return left.ink + gap;
  return Math.max(best, left.ink * 0.35);
}

const option = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('usage: bake-display-font.ts <font.ttf> --source=URL --author=NAME');
  const preview = process.argv.includes('--preview');
  const source = option('source') ?? (preview ? 'PREVIEW ONLY: DO NOT COMMIT' : undefined);
  const author = option('author') ?? (preview ? 'PREVIEW ONLY: DO NOT COMMIT' : undefined);
  if (!source || !author) {
    throw new Error(
      '--source=URL and --author=NAME are required (or --preview, for a local look).',
    );
  }
  const gap = Number(option('gap') ?? 0);
  const lead = Number(option('lead') ?? 1.3);

  const data = await readFile(resolve(file));
  const font = opentype.parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  const label = option('label') ?? basename(file);
  const glyphOf = (char: string): Glyph => font.charToGlyph(char) as unknown as Glyph;

  const profiles = new Map(LETTERS.map((char) => [char, profileOf(glyphOf(char))]));
  const leads = new Map(LETTERS.map((char) => [char, profileOf(glyphOf(char), lead)]));
  const entries = CHARACTERS.map((char) => {
    const glyph = glyphOf(char);
    if (char === ' ' || glyph.path.commands.length === 0) {
      return `    ${JSON.stringify(char)}: { advance: ${Math.round(glyph.advanceWidth ?? 0)}, d: "" },`;
    }
    const shift = Math.round(glyph.getBoundingBox().x1);
    return `    ${JSON.stringify(char)}: { advance: ${profiles.get(char)!.ink}, d: ${JSON.stringify(toPath(glyph.path.commands, shift))} },`;
  });

  const kerns: string[] = [];
  const leadKerns: string[] = [];
  let nested = 0;
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const right = profiles.get(b)!;
      const left = profiles.get(a)!;
      const adjust = Math.round(distance(left, right, gap) - left.ink);
      if (adjust !== 0) kerns.push(`    ${JSON.stringify(a + b)}: ${adjust},`);
      if (adjust < 0) nested++;
      const big = leads.get(a)!;
      const bigAdjust = Math.round(distance(big, right, gap) - big.ink);
      if (bigAdjust !== 0) leadKerns.push(`    ${JSON.stringify(a + b)}: ${bigAdjust},`);
    }
  }
  const capHeight = Math.round(glyphOf('H').getBoundingBox().y2);
  let ascent = 0;
  let descent = 0;
  for (const letter of LETTERS) {
    const box = glyphOf(letter).getBoundingBox();
    ascent = Math.max(ascent, Math.round(box.y2));
    descent = Math.max(descent, Math.round(-box.y1));
  }

  await writeFile(
    OUTPUT,
    `// Generated by scripts/bake-display-font.ts. Do not edit by hand.
//
// Glyph outlines of the capitals of ${label}, trimmed to their ink and kerned to their shapes with
// a clearance of ${gap} units between outlines.
// Source: ${source}
// Author: ${author}
// See THIRD_PARTY_NOTICES.md. This file holds vector outlines for drawing text, not a font;
// scripts/bake-display-font.ts rebuilds it from the original font.
//
// Each glyph is SVG path data in font units, drawn upright (y already flipped, baseline at 0),
// and its advance width, which is the width of its ink. \`kern\` moves the second letter of a pair
// along, in font units: negative where the shapes tuck together. \`kernLead\` is the same for a
// first letter drawn \`leadScale\` times larger, whose shape is a different size.

export const DISPLAY_FONT: {
  name: string;
  unitsPerEm: number;
  /** Height of a capital letter above the baseline, in font units. */
  capHeight: number;
  /** How high the tallest capital rises above the baseline, and how far the deepest drops below it. */
  ascent: number;
  descent: number;
  /** How much larger the first letter of a word is drawn. */
  leadScale: number;
  glyphs: Record<string, { advance: number; d: string }>;
  kern: Record<string, number>;
  kernLead: Record<string, number>;
} = {
  name: ${JSON.stringify(label)},
  unitsPerEm: ${font.unitsPerEm},
  capHeight: ${capHeight},
  ascent: ${ascent},
  descent: ${descent},
  leadScale: ${lead},
  glyphs: {
${entries.join('\n')}
  },
  kern: {
${kerns.join('\n')}
  },
  kernLead: {
${leadKerns.join('\n')}
  },
};
`,
  );
  console.log(
    `baked ${CHARACTERS.length} glyphs, ${kerns.length} kerning pairs (${nested} tuck in) and ${leadKerns.length} lead pairs from ${label}; gap ${gap}, lead ${lead}`,
  );
  console.log(`wrote ${OUTPUT}${preview ? ' (PREVIEW: do not commit)' : ''}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
