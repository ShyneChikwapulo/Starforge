/**
 * Renders a whole stacked page (hero, a section divider, the five preset cards, a footer) from the
 * example animations, to check that the pieces join without seams. Writes .starforge/page:
 * NN-<name>.svg (animated) and NN-<name>.png for every piece.
 *
 *   pnpm exec tsx scripts/render-page.ts [metrics.json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
  renderFooterSvg,
  renderHeroSvg,
  renderPresetCardSvg,
  renderSectionSvg,
  type HeroCharacter,
} from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';
import { PRESET_IDS, getPreset } from '../packages/presets/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = join(ROOT, '.starforge', 'examples');
const CHARACTER = join(ROOT, '.starforge', 'character');
const OUT = join(ROOT, '.starforge', 'page');

interface Piece {
  name: string;
  animated: string;
  still: string;
}

async function main(): Promise<void> {
  const fallback = join(ROOT, '.starforge', 'metrics-v2.json');
  const file = process.argv[2] ?? (existsSync(fallback) ? fallback : undefined);
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();

  const pieces: Piece[] = [];

  let animated: HeroCharacter | undefined;
  let still: HeroCharacter | undefined;
  if (existsSync(join(CHARACTER, 'sprite.webp'))) {
    const meta = JSON.parse(readFileSync(join(CHARACTER, 'meta.json'), 'utf8'));
    const base = { frameWidth: meta.width, frameHeight: meta.height };
    animated = {
      ...base,
      href: `data:image/webp;base64,${readFileSync(join(CHARACTER, 'sprite.webp')).toString('base64')}`,
      frames: meta.frames,
      fps: meta.fps,
    };
    still = {
      ...base,
      href: `data:image/png;base64,${readFileSync(join(CHARACTER, 'still.png')).toString('base64')}`,
      frames: 1,
    };
  }
  pieces.push({
    name: 'hero',
    animated: renderHeroSvg(metrics, { character: animated, stack: 'top' }),
    still: renderHeroSvg(metrics, { character: still, stack: 'top' }),
  });

  const section = renderSectionSvg('Presets', { subtitle: 'Five ways to see one year' });
  pieces.push({ name: 'section', animated: section, still: section });

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
    pieces.push({
      name: id,
      animated: renderPresetCardSvg(metrics, {
        preset,
        stack: 'none',
        media: { href: `data:image/webp;base64,${readFileSync(webp).toString('base64')}`, ...size },
      }),
      still: renderPresetCardSvg(metrics, {
        preset,
        stack: 'none',
        media: { href: `data:image/png;base64,${png.toString('base64')}`, ...size },
      }),
    });
  }

  const footer = renderFooterSvg(metrics);
  pieces.push({ name: 'footer', animated: footer, still: footer });

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const [index, piece] of pieces.entries()) {
    const prefix = `${String(index).padStart(2, '0')}-${piece.name}`;
    const rendered = new Resvg(piece.still, { fitTo: { mode: 'width', value: 1200 } }).render();
    await writeFile(join(OUT, `${prefix}.svg`), piece.animated);
    await writeFile(join(OUT, `${prefix}.png`), rendered.asPng());
    const note = rendered.height % 60 === 0 ? '' : '  <-- NOT a multiple of 60';
    console.log(`${prefix}: 1200 x ${rendered.height}${note}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
