/**
 * Renders text as a solid mesh from three angles, to check the letters, their lighting and their
 * winding by eye.
 *
 *   pnpm exec tsx scripts/render-text.ts "ShyneChikwapulo 1234 %@&"
 *
 * Writes .starforge/text/sample.png.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createParticleState } from '../packages/core/src/index';
import { encodePng } from '../packages/exporters/src/index';
import { buildTextMesh } from '../packages/presets/src/index';
import { renderFrame } from '../packages/renderer-canvas/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.starforge', 'text', 'sample.png');
const WIDTH = 960;
const HEIGHT = 300;
const VIEWS = [
  { yaw: 0, pitch: 0 },
  { yaw: 0.5, pitch: 0.15 },
  { yaw: -0.6, pitch: 0.3 },
];

async function main(): Promise<void> {
  const text = process.argv[2] ?? 'ShyneChikwapulo 1234 %@&';
  const { mesh, width, missing } = buildTextMesh(text, {
    size: 1,
    depth: 0.35,
    color: [0.25, 0.85, 0.4],
    align: 'center',
    anchor: 'middle',
  });
  if (missing.length > 0) console.log(`not in the font, drawn as ?: ${missing.join(' ')}`);

  const out = new Uint8Array(WIDTH * HEIGHT * 4 * VIEWS.length);
  VIEWS.forEach((view, i) => {
    const frame = renderFrame(createParticleState(0), {
      width: WIDTH,
      height: HEIGHT,
      camera: { ...view, distance: Math.max(6, width * 0.7), fov: Math.PI / 4 },
      background: [0.02, 0.03, 0.06],
      mesh,
    });
    out.set(frame.data, i * WIDTH * HEIGHT * 4);
  });

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, encodePng(WIDTH, HEIGHT * VIEWS.length, out));
  console.log(
    `wrote ${OUTPUT} (${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
