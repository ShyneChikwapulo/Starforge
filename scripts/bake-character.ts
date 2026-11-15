/**
 * Renders a rigged glTF character's idle animation as frames for the hero card: a bust, framed to
 * the card's character slot, as raw RGBA files in .starforge/character/frames. Then
 * scripts/build-sprite.py packs them into one WebP strip. Nothing from the model is committed.
 *
 *   pnpm exec tsx scripts/bake-character.ts [model.glb] [--alpha=keep]
 *   python3 scripts/build-sprite.py .starforge/character/frames .starforge/character
 */
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERO_SLOT } from '../packages/exporters/src/hero';
import { rasterizeSolids, type Camera } from '../packages/renderer-canvas/src/index';
import { fitMesh, measureFit, prepareCharacter, skinCharacter } from './lib/character';
import { load } from './lib/gltf';
import { poseWorld, readClips } from './lib/skeleton';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.starforge', 'character');
const TEXTURES = join(OUT, 'tex');
const FRAMES = join(OUT, 'frames');
const model =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
  join(ROOT, '.starforge', 'models', 'character', 'rita_wheeler.glb');

const CLIP = 'Shoulder Bat Idle';
const FRAME_COUNT = 30;
/** Seconds of the clip between frames. At 8 fps this plays the idle a little faster than real. */
const SPACING = 0.15;
const FPS = 8;
/** The model is fitted to this height, then the camera shows VIEW of it, from above the head. */
const HEIGHT = 1.8;
const VIEW = 1.2;
const TOP_MARGIN = 0.06;
const YAW = 0.4;
/** Shift the picture left by this much, so a long bat is not cut off at the slot's edge. */
const SHIFT_X = 0.06;
/** How far the natural colours are pulled towards the card's yellow, 0..1. */
const TINT = 0.15;

async function main(): Promise<void> {
  if (!existsSync(TEXTURES))
    throw new Error(`Run extract-gltf-textures.py into ${TEXTURES} first.`);
  const { gltf, buffers } = await load(model);
  const clip = readClips(gltf, buffers).find((c) => c.name === CLIP);
  if (!clip) throw new Error(`The model has no clip named "${CLIP}"`);
  const character = prepareCharacter(
    gltf,
    buffers,
    TEXTURES,
    !process.argv.includes('--alpha=keep'),
  );

  const fit = measureFit(skinCharacter(character, poseWorld(gltf, clip, 0)), HEIGHT);
  // Centre the view below the head: shift the model down by that much, in output units.
  const centre = HEIGHT / 2 + TOP_MARGIN - VIEW / 2;
  fit.y += centre / fit.scale;
  fit.x -= SHIFT_X / fit.scale;

  const fov = Math.PI / 4;
  const camera: Camera = {
    yaw: YAW,
    pitch: 0.04,
    distance: VIEW / (2 * Math.tan(fov / 2)),
    fov,
  };
  const { width, height } = HERO_SLOT;

  await rm(FRAMES, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });
  for (let f = 0; f < FRAME_COUNT; f++) {
    const started = Date.now();
    const mesh = fitMesh(skinCharacter(character, poseWorld(gltf, clip, f * SPACING)), fit);
    const layer = rasterizeSolids([{ mesh }], camera, width, height);
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      let r = layer.color[i * 3]!;
      let g = layer.color[i * 3 + 1]!;
      let b = layer.color[i * 3 + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r * (1 - TINT) + Math.min(1, lum * 1.15) * TINT;
      g = g * (1 - TINT) + Math.min(1, lum * 1.05) * TINT;
      b = b * (1 - TINT) + Math.min(1, lum * 0.25) * TINT;
      rgba[i * 4] = Math.round(255 * Math.min(1, r));
      rgba[i * 4 + 1] = Math.round(255 * Math.min(1, g));
      rgba[i * 4 + 2] = Math.round(255 * Math.min(1, b));
      rgba[i * 4 + 3] = Math.round(255 * layer.coverage[i]!);
    }
    await writeFile(join(FRAMES, `frame-${String(f).padStart(3, '0')}.rgba`), rgba);
    console.log(`frame ${f + 1}/${FRAME_COUNT} in ${Date.now() - started} ms`);
  }
  await writeFile(
    join(FRAMES, 'meta.json'),
    JSON.stringify({ width, height, frames: FRAME_COUNT, fps: FPS, clip: CLIP, spacing: SPACING }),
  );
  console.log(`wrote ${FRAME_COUNT} frames to ${FRAMES}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
