/**
 * Renders a contact sheet of any rigged glTF/GLB character, to judge it by eye before baking it:
 * six poses across its first animation (or six camera angles, if it has none), drawn once for each
 * way a model can face. Nothing from the model is committed.
 *
 *   python3 scripts/extract-gltf-textures.py model.glb out/tex 512
 *   pnpm exec tsx scripts/preview-character.ts model.glb --textures=out/tex --out=out
 *     [--clip=NAME] [--hide=meshOrNodeName,...] [--alpha=keep]
 *
 * Writes <out>/sheet.png. The top row assumes the model faces +z (the glTF default), the bottom
 * row that it faces -z.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rasterizeSolids, type Camera } from '../packages/renderer-canvas/src/index';
import { fitMesh, measureFit, prepareCharacter, skinCharacter } from './lib/character';
import { load } from './lib/gltf';
import { encodePng } from './lib/png';
import { poseWorld, readClips } from './lib/skeleton';

const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const model = args.find((a) => !a.startsWith('--'));
if (!model) throw new Error('usage: preview-character.ts model.glb --textures=DIR --out=DIR');

const OUT = resolve(option('out') ?? '.starforge/preview');
const TEXTURES = resolve(option('textures') ?? join(OUT, 'tex'));
const HIDE = (option('hide') ?? '').split(',').filter(Boolean);
const COLS = 6;
const W = 320;
const H = 440;
const HEIGHT = 1.8;
const DISTANCE = 2.7;

async function main(): Promise<void> {
  if (!existsSync(TEXTURES))
    throw new Error(`No textures in ${TEXTURES}; run the extractor first.`);
  const { gltf, buffers } = await load(resolve(model!));
  const clips = readClips(gltf, buffers);
  const wanted = option('clip');
  const clip = clips.find((c) => c.name === wanted) ?? clips[0] ?? null;
  const animated = clip !== null && clip.duration > 0.1;
  console.log(
    `clip: ${clip ? `${clip.name} (${clip.duration.toFixed(2)} s)` : 'none'}; ` +
      `${animated ? 'animated' : 'static, so the camera swings instead'}`,
  );

  const character = prepareCharacter(gltf, buffers, TEXTURES, !args.includes('--alpha=keep'), HIDE);
  console.log(
    `${character.stats.vertices} vertices, ${character.stats.triangles} triangles, ` +
      `${character.stats.dropped} dropped as transparent; hiding: ${HIDE.join(', ') || 'nothing'}`,
  );

  const fit = measureFit(skinCharacter(character, poseWorld(gltf, clip, 0)), HEIGHT);
  const sheetWidth = COLS * W;
  const sheet = new Uint8Array(sheetWidth * H * 2 * 3);
  const times = Array.from({ length: COLS }, (_, k) =>
    animated ? (clip!.duration * k) / COLS : 0,
  );
  const yaws = animated ? Array(COLS).fill(0.3) : [0, 0.25, 0.5, -0.25, -0.5, 0.8];

  for (const [row, facing] of (['+z', '-z'] as const).entries()) {
    for (let c = 0; c < COLS; c++) {
      const mesh = fitMesh(skinCharacter(character, poseWorld(gltf, clip, times[c]!)), fit, facing);
      const camera: Camera = { yaw: yaws[c]!, pitch: 0.04, distance: DISTANCE, fov: Math.PI / 4 };
      const layer = rasterizeSolids([{ mesh }], camera, W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const dx = x - W / 2;
          const dy = y - H * 0.45;
          const glow = 0.35 * Math.exp(-(dx * dx + dy * dy) / (2 * (W * 0.35) ** 2));
          const bg = [0.04 + glow * 0.9, 0.04 + glow * 0.8, 0.03 + glow * 0.08];
          const cov = layer.coverage[i]!;
          const o = ((row * H + y) * sheetWidth + c * W + x) * 3;
          for (let k = 0; k < 3; k++) {
            sheet[o + k] = Math.round(
              255 * Math.min(1, bg[k]! * (1 - cov) + layer.color[i * 3 + k]! * cov),
            );
          }
        }
      }
    }
    console.log(`row ${row + 1}: assuming the model faces ${facing}`);
  }

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'sheet.png'), encodePng(sheetWidth, H * 2, sheet));
  console.log(`wrote ${join(OUT, 'sheet.png')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
