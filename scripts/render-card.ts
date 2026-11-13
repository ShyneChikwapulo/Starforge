/**
 * Renders the profile card from a metrics file, as an SVG and as a PNG, to check it by eye.
 *
 *   pnpm exec tsx scripts/render-card.ts [metrics.json]
 *
 * Uses the sample data when no file is given. Writes .starforge/card/card.svg and card.png. The PNG
 * is a still of the finished card: it uses whatever fonts this machine has, and it shows no
 * animation.
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderCardSvg } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = join(ROOT, '.starforge', 'card');

async function main(): Promise<void> {
  const file = process.argv[2];
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();
  const svg = renderCardSvg(metrics);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1600 },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();

  await mkdir(DIRECTORY, { recursive: true });
  await writeFile(join(DIRECTORY, 'card.svg'), svg);
  await writeFile(join(DIRECTORY, 'card.png'), png);
  console.log(`wrote ${DIRECTORY}/card.svg (${svg.length} bytes) and card.png`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
