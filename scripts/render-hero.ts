/**
 * Renders the hero card from a metrics file as an animated SVG and as a PNG still, to check it by
 * eye. The character comes from .starforge/character (see bake-character.ts); without it the card
 * is drawn without one.
 *
 *   pnpm exec tsx scripts/render-hero.ts [metrics.json]
 *
 * Writes .starforge/hero/hero.svg (animated) and hero.png (first frame, no CSS animation).
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderHeroSvg, type HeroCharacter } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics } from '../packages/github-data/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHARACTER = join(ROOT, '.starforge', process.env.CHARACTER_DIR ?? 'character');
const OUT = join(ROOT, '.starforge', process.env.HERO_OUT ?? 'hero');

async function main(): Promise<void> {
  const fallback = join(ROOT, '.starforge', 'metrics-v2.json');
  const file = process.argv[2] ?? (existsSync(fallback) ? fallback : undefined);
  const metrics = file
    ? parseMetrics(JSON.parse(readFileSync(resolve(file), 'utf8')))
    : createSampleMetrics();

  let animated: HeroCharacter | undefined;
  let still: HeroCharacter | undefined;
  if (existsSync(join(CHARACTER, 'sprite.webp'))) {
    const meta = JSON.parse(readFileSync(join(CHARACTER, 'meta.json'), 'utf8'));
    const sprite = readFileSync(join(CHARACTER, 'sprite.webp')).toString('base64');
    const first = readFileSync(join(CHARACTER, 'still.png')).toString('base64');
    animated = {
      href: `data:image/webp;base64,${sprite}`,
      frameWidth: meta.width,
      frameHeight: meta.height,
      frames: meta.frames,
      fps: meta.fps,
      density: meta.density,
    };
    still = {
      href: `data:image/png;base64,${first}`,
      frameWidth: meta.width,
      frameHeight: meta.height,
      frames: 1,
      density: meta.density,
    };
  } else {
    console.log('No character sprite found; drawing the card without one.');
  }

  const svg = renderHeroSvg(metrics, { character: animated });
  const preview = renderHeroSvg(metrics, { character: still });
  const png = new Resvg(preview, {
    fitTo: { mode: 'width', value: 1600 },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'hero.svg'), svg);
  await writeFile(join(OUT, 'hero.png'), png);
  console.log(`wrote ${OUT}/hero.svg (${(svg.length / 1024).toFixed(0)} KB) and hero.png`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
