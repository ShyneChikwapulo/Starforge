/**
 * Poses a rigged glTF character with its animation clips, bakes its textures onto the vertices,
 * and renders a contact sheet to check framing, facing and look by eye. Nothing from the model is
 * ever committed; it only reads it.
 *
 *   python3 scripts/extract-gltf-textures.py model.glb .starforge/character/tex 512
 *   pnpm exec tsx scripts/render-character.ts [model.glb] [--alpha=keep]
 *
 * Writes .starforge/character/sheet.png: a natural row on top and a yellow HUD grade below.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rasterizeSolids, type Camera } from '../packages/renderer-canvas/src/index';
import { fitMesh, measureFit, prepareCharacter, skinCharacter } from './lib/character';
import { load } from './lib/gltf';
import { encodePng } from './lib/png';
import { poseWorld, readClips } from './lib/skeleton';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.starforge', 'character');
const TEXTURES = join(OUT, 'tex');
const model =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
  join(ROOT, '.starforge', 'models', 'character', 'rita_wheeler.glb');
const keepAlpha = process.argv.includes('--alpha=keep');

const W = 320;
const H = 440;
const HEIGHT = 1.8;
const DISTANCE = 2.7;

/** Clip name, seconds into it, camera yaw. */
const CELLS: [string, number, number][] = [
  ['Shoulder Bat Idle', 0, 0],
  ['Shoulder Bat Idle', 0, 0.45],
  ['Shoulder Bat Idle', 7, 0.45],
  ['Shoulder Bat Look Left 01', 1.8, 0.45],
  ['Shoulder Bat Conversation Step 01', 4, 0.45],
];

async function main(): Promise<void> {
  if (!existsSync(TEXTURES)) {
    throw new Error(`No textures in ${TEXTURES}. Run scripts/extract-gltf-textures.py first.`);
  }
  const { gltf, buffers } = await load(model);
  const clips = readClips(gltf, buffers);
  const modes: Record<string, number> = {};
  for (const m of (gltf.materials ?? []) as { alphaMode?: string }[]) {
    const mode = m.alphaMode ?? 'OPAQUE';
    modes[mode] = (modes[mode] ?? 0) + 1;
  }
  console.log(`${clips.length} clips; material alpha modes`, modes);

  const character = prepareCharacter(gltf, buffers, TEXTURES, !keepAlpha);
  console.log(
    `${character.stats.vertices} vertices, ${character.stats.triangles} triangles, ` +
      `${character.stats.dropped} dropped as transparent`,
  );

  const clip = (name: string) => clips.find((c) => c.name === name) ?? clips[0]!;
  const reference = skinCharacter(character, poseWorld(gltf, clip(CELLS[0]![0]), 0));
  const fit = measureFit(reference, HEIGHT);
  console.log('fit', fit);

  const cols = CELLS.length;
  const sheetWidth = cols * W;
  const sheet = new Uint8Array(sheetWidth * H * 2 * 3);
  const paint = (
    ox: number,
    oy: number,
    layer: ReturnType<typeof rasterizeSolids>,
    hud: boolean,
  ) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const dx = x - W / 2;
        const dy = y - H * 0.45;
        const glow = 0.35 * Math.exp(-(dx * dx + dy * dy) / (2 * (W * 0.35) ** 2));
        const bg = [0.04 + glow * 0.9, 0.04 + glow * 0.8, 0.03 + glow * 0.08];
        let r = layer.color[i * 3]!;
        let g = layer.color[i * 3 + 1]!;
        let b = layer.color[i * 3 + 2]!;
        if (hud) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          r = r * 0.35 + Math.min(1, lum * 1.15) * 0.65;
          g = g * 0.35 + Math.min(1, lum * 1.05) * 0.65;
          b = b * 0.35 + Math.min(1, lum * 0.25) * 0.65;
        }
        const cov = layer.coverage[i]!;
        const o = ((oy + y) * sheetWidth + ox + x) * 3;
        sheet[o] = Math.round(255 * Math.min(1, bg[0]! * (1 - cov) + r * cov));
        sheet[o + 1] = Math.round(255 * Math.min(1, bg[1]! * (1 - cov) + g * cov));
        sheet[o + 2] = Math.round(255 * Math.min(1, bg[2]! * (1 - cov) + b * cov));
      }
    }
  };

  for (let c = 0; c < cols; c++) {
    const [name, time, yaw] = CELLS[c]!;
    const started = Date.now();
    const mesh = fitMesh(skinCharacter(character, poseWorld(gltf, clip(name), time)), fit);
    const camera: Camera = { yaw, pitch: 0.04, distance: DISTANCE, fov: Math.PI / 4 };
    const layer = rasterizeSolids([{ mesh }], camera, W, H);
    paint(c * W, 0, layer, false);
    paint(c * W, H, layer, true);
    console.log(
      `cell ${c}: ${clip(name).name} @ ${time}s yaw ${yaw} in ${Date.now() - started} ms`,
    );
  }

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'sheet.png'), encodePng(sheetWidth, H * 2, sheet));
  console.log(`wrote ${OUT}/sheet.png`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
