/**
 * Renders the compact profile card in several skins, to compare them by eye.
 *
 *   pnpm exec tsx scripts/render-skins.ts [metrics.json]
 *
 * Writes .starforge/skins/card-<name>.png, one per skin.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { createDefaultSkin, renderCardSvg, resolveSkin } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.starforge', 'skins');

async function main(): Promise<void> {
  const fallback = join(ROOT, '.starforge', 'metrics-v2.json');
  const file = process.argv[2] ?? (existsSync(fallback) ? fallback : undefined);
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();

  const skins = [
    ['cyberpunk', resolveSkin('cyberpunk')],
    ['default-green', resolveSkin('default')],
    ['default-blue', createDefaultSkin('#2f81f4')],
  ] as const;
  await mkdir(OUT, { recursive: true });
  for (const [name, skin] of skins) {
    const svg = renderCardSvg(metrics, { skin });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } }).render().asPng();
    await writeFile(join(OUT, `card-${name}.png`), png);
    console.log(`card-${name}.png (${(svg.length / 1024).toFixed(0)} KB of SVG)`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
