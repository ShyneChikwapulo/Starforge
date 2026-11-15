/**
 * Wraps each preset's example animation in its HUD card, to check the cards by eye. Needs the
 * example images from `pnpm examples` in .starforge/examples. Writes .starforge/preset-cards:
 * <id>-card.svg (animated) and <id>-card.png (first frame).
 *
 *   pnpm exec tsx scripts/render-preset-cards.ts [metrics.json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderPresetCardSvg } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';
import { PRESET_IDS, getPreset } from '../packages/presets/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = join(ROOT, '.starforge', 'examples');
const OUT = join(ROOT, '.starforge', 'preset-cards');

async function main(): Promise<void> {
  const file = process.argv[2];
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();
  await mkdir(OUT, { recursive: true });

  for (const id of PRESET_IDS) {
    const preset = getPreset(id)!;
    const webp = join(EXAMPLES, `${id}.webp`);
    const poster = join(EXAMPLES, `${id}-poster.png`);
    if (!existsSync(webp) || !existsSync(poster)) {
      console.log(`skipping ${id}: run pnpm examples first`);
      continue;
    }
    const png = readFileSync(poster);
    const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    const card = { id, name: preset.name, caption: preset.caption };

    const animated = renderPresetCardSvg(metrics, {
      preset: card,
      media: { href: `data:image/webp;base64,${readFileSync(webp).toString('base64')}`, ...size },
    });
    const still = renderPresetCardSvg(metrics, {
      preset: card,
      media: { href: `data:image/png;base64,${png.toString('base64')}`, ...size },
    });
    const raster = new Resvg(still, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

    await writeFile(join(OUT, `${id}-card.svg`), animated);
    await writeFile(join(OUT, `${id}-card.png`), raster);
    console.log(
      `${id}: ${(animated.length / 1024).toFixed(0)} KB, media ${size.width}x${size.height}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
