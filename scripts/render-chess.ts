/**
 * Renders the chess preset from a metrics file at three moments of its camera sway, to check the
 * board, the pieces and the framing by eye.
 *
 *   pnpm exec tsx scripts/render-chess.ts [metrics.json]
 *
 * Uses the sample data when no file is given. Writes .starforge/chess/board.png.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, renderLoop } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';
import { chessPreset } from '../packages/presets/src/chess';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, '.starforge', 'chess', 'board.png');

async function main(): Promise<void> {
  const file = process.argv[2];
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();
  const { width, height } = chessPreset.size;

  // Four frames sit at a quarter of the loop apart: the start, one extreme of the sway, the start
  // again, and the other extreme.
  const frames = renderLoop(chessPreset, metrics, { width, height, frames: 4, seed: 1 });
  const shown = [frames[0]!, frames[1]!, frames[3]!];

  const out = new Uint8Array(width * height * 4 * shown.length);
  shown.forEach((frame, i) => out.set(frame.data, i * width * height * 4));
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, encodePng(width, height * shown.length, out));
  console.log(`wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
