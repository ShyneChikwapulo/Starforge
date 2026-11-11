/**
 * Bakes glyph outlines from Inter (SIL OFL 1.1) for the 3D text in packages/presets/src/text.ts.
 *
 *   pnpm exec tsx scripts/bake-text-font.ts .starforge/cache/inter/Inter-SemiBold.ttf "Inter SemiBold 4.1"
 *
 * For every printable ASCII character it flattens the outline into polygons, sorts out which
 * contours are outer shapes and which are holes, triangulates the face, and writes the result to
 * packages/presets/src/text-font-data.ts. A preview of the baked triangles and a report are
 * written to .starforge/text/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import earcut from 'earcut';
import opentype from 'opentype.js';
import { lines, pack16 } from './lib/sampling';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'packages', 'presets', 'src', 'text-font-data.ts');
const REPORT = join(ROOT, '.starforge', 'text', 'report.json');
const SHEET = join(ROOT, '.starforge', 'text', 'glyphs.png');

/** Printable ASCII. */
const FIRST = 32;
const LAST = 126;
/** Straight segments per curve. Quadratic curves are TrueType's; cubic ones come from CFF fonts. */
const QUADRATIC_STEPS = 6;
const CUBIC_STEPS = 8;
/** The triangles must cover the outline's area to within this share. */
const AREA_TOLERANCE = 0.005;

type Point = [number, number];

interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface BakedGlyph {
  advance: number;
  /** x, y pairs in font units, y up. */
  points: number[];
  /** Point count of each polygon, in the order they appear in `points`. */
  contours: number[];
  /** Three indices into the points per triangle. */
  triangles: number[];
  /** Net outline area and the area the triangles cover, for the check. */
  area: number;
  covered: number;
}

/** Round to whole font units, drop repeated points and the closing duplicate. */
function clean(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const [x, y] of points) {
    const p: Point = [Math.round(x), Math.round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first![0] === last![0] && first![1] === last![1]) out.pop();
  return out;
}

/** Turn path commands into closed polygons, with curves flattened into straight segments. */
function flatten(commands: PathCommand[]): Point[][] {
  const contours: Point[][] = [];
  let current: Point[] = [];
  let x = 0;
  let y = 0;
  const finish = (): void => {
    if (current.length > 0) contours.push(current);
    current = [];
  };
  for (const c of commands) {
    if (c.type === 'M') {
      finish();
      x = c.x!;
      y = c.y!;
      current.push([x, y]);
    } else if (c.type === 'L') {
      x = c.x!;
      y = c.y!;
      current.push([x, y]);
    } else if (c.type === 'Q') {
      for (let s = 1; s <= QUADRATIC_STEPS; s++) {
        const t = s / QUADRATIC_STEPS;
        const u = 1 - t;
        current.push([
          u * u * x + 2 * u * t * c.x1! + t * t * c.x!,
          u * u * y + 2 * u * t * c.y1! + t * t * c.y!,
        ]);
      }
      x = c.x!;
      y = c.y!;
    } else if (c.type === 'C') {
      for (let s = 1; s <= CUBIC_STEPS; s++) {
        const t = s / CUBIC_STEPS;
        const u = 1 - t;
        current.push([
          u * u * u * x + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!,
          u * u * u * y + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!,
        ]);
      }
      x = c.x!;
      y = c.y!;
    } else if (c.type === 'Z') {
      finish();
    }
  }
  finish();
  return contours.map(clean).filter((points) => points.length >= 3);
}

/** Positive for a counter-clockwise polygon with y up. */
function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

function inside(x: number, y: number, polygon: Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

interface Glyph {
  advanceWidth?: number;
  path: { commands: PathCommand[] };
  getBoundingBox(): { y2: number };
}

function bakeGlyph(glyph: Glyph): BakedGlyph {
  const raw = flatten(glyph.path.commands);

  // How deeply each contour is nested. Even depth is an outer shape, odd depth is a hole.
  const info = raw.map((points) => ({ points, area: signedArea(points), depth: 0, parent: -1 }));
  info.forEach((a, i) => {
    let parentArea = Infinity;
    info.forEach((b, j) => {
      if (i === j || Math.abs(b.area) <= Math.abs(a.area)) return;
      if (!inside(a.points[0]![0], a.points[0]![1], b.points)) return;
      a.depth++;
      if (Math.abs(b.area) < parentArea) {
        parentArea = Math.abs(b.area);
        a.parent = j;
      }
    });
  });

  // Outer shapes run counter-clockwise and holes clockwise, so material is always on the left.
  const oriented = info.map((c) => {
    const wantCounterClockwise = c.depth % 2 === 0;
    return c.area > 0 === wantCounterClockwise ? c.points : [...c.points].reverse();
  });

  const points: number[] = [];
  const contours: number[] = [];
  const triangles: number[] = [];
  let area = 0;
  info.forEach((outer, i) => {
    if (outer.depth % 2 !== 0) return;
    const holes = info.flatMap((hole, j) => (hole.depth % 2 === 1 && hole.parent === i ? [j] : []));
    const base = points.length / 2;
    const flat: number[] = [];
    const holeStarts: number[] = [];
    let count = 0;
    [i, ...holes].forEach((index, k) => {
      if (k > 0) holeStarts.push(count);
      for (const [x, y] of oriented[index]!) {
        flat.push(x, y);
        points.push(x, y);
      }
      contours.push(oriented[index]!.length);
      count += oriented[index]!.length;
      area += Math.abs(info[index]!.area) * (k === 0 ? 1 : -1);
    });
    for (const t of earcut(flat, holeStarts, 2)) triangles.push(base + t);
  });

  let covered = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    covered +=
      Math.abs(
        (points[b * 2]! - points[a * 2]!) * (points[c * 2 + 1]! - points[a * 2 + 1]!) -
          (points[c * 2]! - points[a * 2]!) * (points[b * 2 + 1]! - points[a * 2 + 1]!),
      ) / 2;
  }

  return {
    advance: Math.round(glyph.advanceWidth ?? 0),
    points,
    contours,
    triangles,
    area,
    covered,
  };
}

/** Little-endian uint16 values in base64. */
function packU16(values: number[]): string {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, i) => buffer.writeUInt16LE(value, i * 2));
  return buffer.toString('base64');
}

/** A contact sheet of the baked triangles, so holes and curves can be checked by eye. */
async function writeSheet(glyphs: BakedGlyph[], capHeight: number): Promise<void> {
  const columns = 16;
  const cell = 96;
  const rows = Math.ceil(glyphs.length / columns);
  const scale = 56 / capHeight;
  const shapes: string[] = [];
  glyphs.forEach((glyph, n) => {
    const ox = (n % columns) * cell + 16;
    const oy = Math.floor(n / columns) * cell + 70;
    const at = (index: number): string =>
      `${(ox + glyph.points[index * 2]! * scale).toFixed(2)},${(oy - glyph.points[index * 2 + 1]! * scale).toFixed(2)}`;
    for (let t = 0; t < glyph.triangles.length; t += 3) {
      shapes.push(
        `<polygon points="${at(glyph.triangles[t]!)} ${at(glyph.triangles[t + 1]!)} ${at(glyph.triangles[t + 2]!)}"/>`,
      );
    }
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cell}" height="${rows * cell}">` +
    `<rect width="100%" height="100%" fill="#0d1117"/>` +
    `<g fill="#7ee787" stroke="#7ee787" stroke-width="0.4" stroke-linejoin="round">${shapes.join('')}</g></svg>`;
  await mkdir(dirname(SHEET), { recursive: true });
  await writeFile(SHEET, new Resvg(svg).render().asPng());
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: pnpm exec tsx scripts/bake-text-font.ts <font.ttf> [label]');
  const data = await readFile(resolve(file));
  const font = opentype.parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  const names = font.names as unknown as Record<string, Record<string, string> | undefined>;
  const fullName = process.argv[3] ?? names.fullName?.en ?? basename(file);
  const bbox = (char: string): number =>
    Math.round((font.charToGlyph(char) as unknown as Glyph).getBoundingBox().y2);
  const capHeight = bbox('H');
  const xHeight = bbox('x');

  const glyphs: BakedGlyph[] = [];
  const warnings: string[] = [];
  for (let code = FIRST; code <= LAST; code++) {
    const char = String.fromCharCode(code);
    const baked = bakeGlyph(font.charToGlyph(char) as unknown as Glyph);
    if (baked.area > 0 && Math.abs(baked.covered - baked.area) > AREA_TOLERANCE * baked.area) {
      warnings.push(
        `${JSON.stringify(char)}: triangles cover ${baked.covered.toFixed(0)} but the outline is ${baked.area.toFixed(0)}`,
      );
    }
    glyphs.push(baked);
  }

  const entries = glyphs.map((glyph) => {
    return `  {
    advance: ${glyph.advance},
    points: [
${lines(pack16(glyph.points, 1))}
    ].join(''),
    contours: '${packU16(glyph.contours)}',
    triangles: [
${lines(packU16(glyph.triangles))}
    ].join(''),
  },`;
  });

  await writeFile(
    OUTPUT,
    `// Generated by scripts/bake-text-font.ts. Do not edit by hand.
//
// Glyph outlines from ${fullName} (https://rsms.me/inter/), licensed under the SIL Open Font
// License 1.1. Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter).
// See THIRD_PARTY_NOTICES.md and licenses/Inter-OFL-1.1.txt. This file holds triangle meshes built
// from the outlines, not a font; scripts/bake-text-font.ts rebuilds it from the original font.
//
// One entry per character, starting at FIRST_GLYPH, in font units with y up. "points" is
// little-endian int16 x, y pairs: the outline polygons one after another, each outer shape followed
// by its holes. Outer shapes run counter-clockwise and holes clockwise, so the material is always
// on the left of an edge. "contours" is little-endian uint16 point counts, one per polygon.
// "triangles" is little-endian uint16 indices into the points, three per triangle, filling the face.

export const FONT_NAME = ${JSON.stringify(fullName)};
export const FONT_UNITS_PER_EM = ${font.unitsPerEm};
/** Height of a capital letter above the baseline. */
export const FONT_CAP_HEIGHT = ${capHeight};
export const FONT_X_HEIGHT = ${xHeight};
/** The character code of the first entry in glyphData. */
export const FIRST_GLYPH = ${FIRST};

export const glyphData: { advance: number; points: string; contours: string; triangles: string }[] = [
${entries.join('\n')}
];
`,
  );

  await writeSheet(glyphs, capHeight);
  const totals = {
    glyphs: glyphs.length,
    points: glyphs.reduce((sum, g) => sum + g.points.length / 2, 0),
    triangles: glyphs.reduce((sum, g) => sum + g.triangles.length / 3, 0),
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(
    REPORT,
    `${JSON.stringify(
      {
        font: fullName,
        unitsPerEm: font.unitsPerEm,
        capHeight,
        xHeight,
        ...totals,
        contoursPerGlyph: Object.fromEntries(
          glyphs.map((g, i) => [String.fromCharCode(FIRST + i), g.contours.length]),
        ),
        warnings,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `baked ${totals.glyphs} glyphs, ${totals.points} points, ${totals.triangles} triangles from ${fullName}`,
  );
  console.log(warnings.length ? `warnings:\n${warnings.join('\n')}` : 'no warnings');
  console.log(`wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
