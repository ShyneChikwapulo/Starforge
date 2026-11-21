/**
 * Renders every kind of card in one skin, to judge a whole page by eye.
 *
 *   pnpm exec tsx scripts/render-skin-gallery.ts --skin=default
 *
 * Needs the example images from `pnpm examples` (for the preset cards). A character, if one has
 * been baked into .starforge/character-cyber, is drawn in the hero. Writes
 * .starforge/skins/<skin>/NN-name.png.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  renderCardSvg,
  renderFooterSvg,
  renderHeroSvg,
  renderPresetCardSvg,
  renderSectionSvg,
  resolveSkin,
  SKIN_NAMES,
  type SkinName,
} from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';
import { getPreset } from '../packages/presets/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.find((a) => a.startsWith('--skin='))?.slice(7) ?? 'default';
if (!(SKIN_NAMES as readonly string[]).includes(arg)) {
  throw new Error(`Unknown skin "${arg}". Choose one of: ${SKIN_NAMES.join(', ')}`);
}
const skin = resolveSkin(arg as SkinName);
const OUT = join(ROOT, '.starforge', 'skins', arg);

async function main(): Promise<void> {
  const fallback = join(ROOT, '.starforge', 'metrics-v2.json');
  const metrics = existsSync(fallback)
    ? parseMetrics(JSON.parse(readFileSync(fallback, 'utf8')))
    : createSampleMetrics();

  const characterDir = join(ROOT, '.starforge', 'character-cyber');
  const character =
    existsSync(join(characterDir, 'still.png')) && existsSync(join(characterDir, 'meta.json'))
      ? (() => {
          const meta = JSON.parse(readFileSync(join(characterDir, 'meta.json'), 'utf8'));
          return {
            href: `data:image/png;base64,${readFileSync(join(characterDir, 'still.png')).toString('base64')}`,
            frameWidth: meta.width,
            frameHeight: meta.height,
            frames: 1,
            density: meta.density,
          };
        })()
      : undefined;

  const pieces: [string, string][] = [
    ['card', renderCardSvg(metrics, { skin })],
    ['hero', renderHeroSvg(metrics, { skin, character })],
    ['section', renderSectionSvg('Presets', { skin, subtitle: 'Five ways to see one year' })],
  ];
  for (const id of ['galaxy', 'atom']) {
    const poster = join(ROOT, '.starforge', 'examples', `${id}-poster.png`);
    if (!existsSync(poster)) continue;
    const png = readFileSync(poster);
    pieces.push([
      id,
      renderPresetCardSvg(metrics, {
        skin,
        preset: getPreset(id)!,
        media: {
          href: `data:image/png;base64,${png.toString('base64')}`,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
        },
      }),
    ]);
  }
  pieces.push(['footer', renderFooterSvg(metrics, { skin })]);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const [index, [name, svg]] of pieces.entries()) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } }).render().asPng();
    await writeFile(join(OUT, `${String(index).padStart(2, '0')}-${name}.png`), png);
    console.log(`${String(index).padStart(2, '0')}-${name}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
