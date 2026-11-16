/**
 * Renders a rigged glTF character's animation as frames for the hero card: a bust, framed to the
 * card's character slot, as raw RGBA files in <out>/frames. Then scripts/build-sprite.py packs
 * them into one WebP strip. Nothing from the model is committed.
 *
 *   python3 scripts/extract-gltf-textures.py model.glb <out>/tex 512
 *   pnpm exec tsx scripts/bake-character.ts model.glb --out=<out> --clip=NAME [options]
 *   python3 scripts/build-sprite.py <out>/frames <out> 92
 *
 * Options (all optional; the defaults suit the first model this was made for):
 *   --textures=DIR   extracted textures (default <out>/tex)
 *   --clip=NAME      the animation clip to play
 *   --hide=A,B       mesh or node names to leave out, such as a speech bubble
 *   --facing=+z|-z   the way the model faces (+z is the glTF default; check with preview-character)
 *   --frames=N       frames in the strip (default 30)
 *   --spacing=S      seconds of the clip between frames (default 0.15)
 *   --fps=N          playback speed written to meta.json (default 8)
 *   --view=V         how much height is in view, after fitting the model to 1.8 (default 1.2)
 *   --top=T          space above the head, in the same units (default 0.06)
 *   --yaw=Y          camera angle in radians (default 0.4)
 *   --shiftx=X       move the picture left by this much (default 0.06)
 *   --gamma=G        lift dark colours by raising them to 1/G (default 1: no change)
 *   --gain=G         multiply the colours (default 1)
 *   --tint=T         how far to pull colours towards the card's yellow, 0..1 (default 0.15)
 *   --rim=R          yellow rim light along the right and upper edges, 0..1 (default 0: off)
 *   --alpha=keep     keep transparent triangles instead of dropping them
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
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const number = (name: string, fallback: number): number => {
  const value = option(name);
  return value === undefined ? fallback : Number(value);
};

const model =
  args.find((a) => !a.startsWith('--')) ??
  join(ROOT, '.starforge', 'models', 'character', 'rita_wheeler.glb');
const OUT = resolve(option('out') ?? join(ROOT, '.starforge', 'character'));
const TEXTURES = resolve(option('textures') ?? join(OUT, 'tex'));
const FRAMES = join(OUT, 'frames');
const CLIP = option('clip') ?? 'Shoulder Bat Idle';
const HIDE = (option('hide') ?? '').split(',').filter(Boolean);
const FACING = option('facing') === '+z' ? '+z' : '-z';
const FRAME_COUNT = number('frames', 30);
const SPACING = number('spacing', 0.15);
const FPS = number('fps', 8);
const HEIGHT = 1.8;
const VIEW = number('view', 1.2);
const TOP_MARGIN = number('top', 0.06);
const YAW = number('yaw', 0.4);
const SHIFT_X = number('shiftx', 0.06);
const GAMMA = number('gamma', 1);
const GAIN = number('gain', 1);
const TINT = number('tint', 0.15);
const RIM = number('rim', 0);

async function main(): Promise<void> {
  if (!existsSync(TEXTURES))
    throw new Error(`Run extract-gltf-textures.py into ${TEXTURES} first.`);
  const { gltf, buffers } = await load(resolve(model));
  const clips = readClips(gltf, buffers);
  const clip = clips.find((c) => c.name === CLIP);
  if (!clip) {
    throw new Error(
      `No clip named "${CLIP}". The model has: ${clips.map((c) => c.name).join(' | ')}`,
    );
  }
  const character = prepareCharacter(gltf, buffers, TEXTURES, !args.includes('--alpha=keep'), HIDE);
  console.log(
    `${character.stats.triangles} triangles, ${character.stats.dropped} dropped as transparent; ` +
      `clip ${clip.name} (${clip.duration.toFixed(2)} s); facing ${FACING}; ` +
      `hiding ${HIDE.join(', ') || 'nothing'}`,
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
    const mesh = fitMesh(skinCharacter(character, poseWorld(gltf, clip, f * SPACING)), fit, FACING);
    const layer = rasterizeSolids([{ mesh }], camera, width, height);
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      let r = Math.min(1, Math.pow(layer.color[i * 3]!, 1 / GAMMA) * GAIN);
      let g = Math.min(1, Math.pow(layer.color[i * 3 + 1]!, 1 / GAMMA) * GAIN);
      let b = Math.min(1, Math.pow(layer.color[i * 3 + 2]!, 1 / GAMMA) * GAIN);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r * (1 - TINT) + Math.min(1, lum * 1.15) * TINT;
      g = g * (1 - TINT) + Math.min(1, lum * 1.05) * TINT;
      b = b * (1 - TINT) + Math.min(1, lum * 0.25) * TINT;
      if (RIM > 0) {
        const x = i % width;
        const y = Math.floor(i / width);
        const cov = layer.coverage[i]!;
        const right = x + 4 < width ? layer.coverage[i + 4]! : 0;
        const above = y >= 4 ? layer.coverage[i - 4 * width]! : 0;
        const edge = Math.min(1, Math.max(0, cov - right) + 0.6 * Math.max(0, cov - above));
        r = Math.min(1, r + RIM * edge * 0.99);
        g = Math.min(1, g + RIM * edge * 0.93);
        b = Math.min(1, b + RIM * edge * 0.04);
      }
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
