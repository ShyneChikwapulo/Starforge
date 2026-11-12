/**
 * Renders the five chess pieces in a row, from three angles, to check their shapes by eye.
 *
 *   pnpm exec tsx scripts/render-chess-pieces.ts
 *
 * Writes .starforge/chess/pieces.png.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createParticleState } from '../packages/core/src/index';
import { encodePng } from '../packages/exporters/src/index';
import {
  PIECE_KINDS,
  addBox,
  addPiece,
  createMeshBuilder,
  toMesh,
} from '../packages/presets/src/chess-pieces';
import { hexToRgb } from '../packages/presets/src/scale';
import { renderFrame } from '../packages/renderer-canvas/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.starforge', 'chess', 'pieces.png');
const WIDTH = 960;
const HEIGHT = 340;
const FLOOR = -1.2;
const LEVELS = ['#9fd9ad', '#5cc97a', '#2fb85a', '#18d14a', '#00ff5a'];
const VIEWS = [
  { yaw: 0, pitch: 0.12, distance: 9 },
  { yaw: 0.45, pitch: 0.45, distance: 9 },
  { yaw: -0.9, pitch: 0.3, distance: 8 },
];

async function main(): Promise<void> {
  const b = createMeshBuilder();
  addBox(b, [0, FLOOR - 0.1, 0], [7.4, 0.2, 2.2], [0.07, 0.09, 0.12]);
  PIECE_KINDS.forEach((kind, i) => {
    // World -x is drawn to the right of the image, so the pawn is on the left and the king on the right.
    const x = 2.8 - i * 1.4;
    const tile: [number, number, number] = i % 2 === 0 ? [0.14, 0.17, 0.21] : [0.1, 0.12, 0.16];
    addBox(b, [x, FLOOR + 0.02, 0], [1.3, 0.04, 1.3], tile);
    addPiece(b, kind, x, 0, hexToRgb(LEVELS[i]), FLOOR + 0.04);
  });
  const mesh = toMesh(b);

  const out = new Uint8Array(WIDTH * HEIGHT * 4 * VIEWS.length);
  VIEWS.forEach((view, i) => {
    const frame = renderFrame(createParticleState(0), {
      width: WIDTH,
      height: HEIGHT,
      camera: { ...view, fov: Math.PI / 4 },
      background: [0.02, 0.03, 0.06],
      mesh,
    });
    out.set(frame.data, i * WIDTH * HEIGHT * 4);
  });

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, encodePng(WIDTH, HEIGHT * VIEWS.length, out));
  console.log(`wrote ${OUTPUT} (${mesh.indices.length / 3} triangles)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
