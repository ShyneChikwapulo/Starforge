/**
 * Bakes the atom preset's nucleus from a local glTF model of a GitHub-style kitten: evenly spread
 * points on its surface, plus short "constellation" links between neighbouring points. Skinned
 * parts (the tail) are posed at rest. Only the baked result is committed, never the model.
 *
 *   pnpm exec tsx scripts/bake-atom-kitten.ts [model.gltf]
 *
 * It writes packages/presets/src/atom-kitten-data.ts, and a preview and report in
 * .starforge/atom/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, worldTriangles } from './lib/gltf';
import { encodePng } from './lib/png';
import { createRng, lines, pack16, sampleSurface, spread } from './lib/sampling';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MODEL = join(ROOT, '.starforge', 'models', 'github-kitten', 'scene.gltf');
const OUTPUT = join(ROOT, 'packages', 'presets', 'src', 'atom-kitten-data.ts');
const REPORT = join(ROOT, '.starforge', 'atom', 'kitten-report.json');
const PREVIEW = join(ROOT, '.starforge', 'atom', 'kitten-preview.png');

const POINTS = 9000;
const CANDIDATES_PER_POINT = 12;
/** The first STARS points are the "stars" that links connect. */
const STARS = 900;
const NEIGHBOURS = 3;
/** A link may be at most this many times the median nearest-neighbour distance long. */
const LINK_LIMIT = 3;
const SEED = 11;
const QUANT = 30000;

/** Links between each star and its nearest neighbours, as flat index pairs without repeats. */
function links(points: Float32Array): number[] {
  const nearest: { j: number; d: number }[][] = [];
  const firsts: number[] = [];
  for (let i = 0; i < STARS; i++) {
    const found: { j: number; d: number }[] = [];
    for (let j = 0; j < STARS; j++) {
      if (j === i) continue;
      const d = Math.hypot(
        points[i * 3]! - points[j * 3]!,
        points[i * 3 + 1]! - points[j * 3 + 1]!,
        points[i * 3 + 2]! - points[j * 3 + 2]!,
      );
      found.push({ j, d });
    }
    found.sort((a, b) => a.d - b.d);
    nearest.push(found.slice(0, NEIGHBOURS));
    firsts.push(found[0]!.d);
  }
  firsts.sort((a, b) => a - b);
  const limit = LINK_LIMIT * firsts[Math.floor(firsts.length / 2)]!;
  const seen = new Set<number>();
  const out: number[] = [];
  nearest.forEach((list, i) => {
    for (const { j, d } of list) {
      if (d > limit) continue;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = a * STARS + b;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a, b);
    }
  });
  return out;
}

async function writePreview(points: Float32Array, edges: number[]): Promise<void> {
  const panel = 560;
  const height = 600;
  const width = panel * 2;
  const scale = 440;
  const acc = new Float32Array(width * height * 3);
  const add = (x: number, y: number, r: number, g: number, b: number): void => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    acc[(py * width + px) * 3]! += r;
    acc[(py * width + px) * 3 + 1]! += g;
    acc[(py * width + px) * 3 + 2]! += b;
  };
  const front = (i: number): [number, number] => [
    panel / 2 + points[i * 3]! * scale,
    height / 2 - points[i * 3 + 1]! * scale,
  ];
  const side = (i: number): [number, number] => [
    panel + panel / 2 + points[i * 3 + 2]! * scale,
    height / 2 - points[i * 3 + 1]! * scale,
  ];
  for (let e = 0; e < edges.length; e += 2) {
    for (const view of [front, side]) {
      const [x0, y0] = view(edges[e]!);
      const [x1, y1] = view(edges[e + 1]!);
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps;
        add(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.05, 0.12, 0.2);
      }
    }
  }
  for (let i = 0; i < points.length / 3; i++) {
    for (const view of [front, side]) {
      const [x, y] = view(i);
      add(x, y, 0.3, 0.3, 0.3);
      add(x + 1, y, 0.3, 0.3, 0.3);
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i++)
    rgb[i] = Math.round(8 + 247 * (1 - Math.exp(-acc[i]! * 1.6)));
  await mkdir(dirname(PREVIEW), { recursive: true });
  await writeFile(PREVIEW, encodePng(width, height, rgb));
}

async function main(): Promise<void> {
  const modelPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_MODEL;
  const { gltf, buffers } = await load(modelPath);
  const soup = worldTriangles(gltf, buffers);
  if (soup.length === 0) throw new Error('The model has no triangles.');

  // Normalise: centred on the origin, the longest side 1 long, y up (the kitten faces +z).
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, soup[i + k]!);
      max[k] = Math.max(max[k]!, soup[i + k]!);
    }
  }
  const size = max.map((m, k) => m - min[k]!);
  const longest = Math.max(...size);
  for (let i = 0; i < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) soup[i + k] = (soup[i + k]! - (min[k]! + max[k]!) / 2) / longest;
  }

  const rng = createRng(SEED);
  const sampled = sampleSurface(soup, POINTS * CANDIDATES_PER_POINT, rng);
  const chosen = spread(sampled, POINTS);
  const points = new Float32Array(chosen.length * 3);
  chosen.forEach((source, i) => {
    for (let k = 0; k < 3; k++) points[i * 3 + k] = sampled[source * 3 + k]!;
  });
  const edges = links(points);

  const edgeBuffer = Buffer.alloc(edges.length * 2);
  edges.forEach((value, i) => edgeBuffer.writeUInt16LE(value, i * 2));
  await writeFile(
    OUTPUT,
    `// Generated by scripts/bake-atom-kitten.ts. Do not edit by hand.
//
// This work is based on "Github_kitten"
// (https://sketchfab.com/3d-models/github-kitten-83d5a6d1a12b4427bbfd662fbc478f8d)
// by m.adityamondal2003 (https://sketchfab.com/m.adityamondal2003)
// licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).
//
// Changes: the model was posed at rest, rescaled, and resampled as an evenly spread point set,
// with short links between neighbouring points.
//
// Units: the kitten fits a box 1 across, centred on the origin, y up, facing +z. Points are int16
// little-endian triples (value / ${QUANT}) in base64, ordered so any prefix is an evenly spread
// subset. The first KITTEN_STARS points are the stars; links are pairs of star indices as
// unsigned 16-bit little-endian values in base64.

export const KITTEN_QUANT = ${QUANT};
export const KITTEN_STARS = ${STARS};

export const kittenData = {
  points: [
${lines(pack16(points, QUANT))}
  ].join(''),
  links: [
${lines(edgeBuffer.toString('base64'))}
  ].join(''),
};
`,
  );

  const report = {
    model: modelPath,
    rawSize: size.map((v) => Number(v.toFixed(3))),
    points: points.length / 3,
    stars: STARS,
    links: edges.length / 2,
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  await writePreview(points, edges);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
