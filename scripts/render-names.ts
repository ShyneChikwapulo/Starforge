/**
 * Renders the hero card for a range of names, to check by eye that the name font copes with all of
 * them: accents, other scripts, long and short names, initials and punctuation. The whole card is
 * rendered; crop the top of each image to see the title bar.
 *
 *   pnpm exec tsx scripts/render-names.ts
 *
 * Writes .starforge/names/NN.png, one per name, in the order of NAMES.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { renderHeroSvg } from '../packages/exporters/src/index';
import { createSampleMetrics } from '../packages/github-data/src/index';

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.starforge', 'names');

export const NAMES: (string | null)[] = [
  'Shine Chikwapulo',
  'Al',
  'J',
  'Alexandria Ocasio-Cortez',
  'José Álvarez',
  'J. R. R. Tolkien',
  'mary-jane watson',
  'R2D2 Bot 3000',
  '李雷',
  'Supercalifragilistic Hippopotomonstrosesquippedalio',
  "O'Brien McDonald",
  null,
];

async function main(): Promise<void> {
  const base = createSampleMetrics();
  await mkdir(OUT, { recursive: true });
  for (const [index, name] of NAMES.entries()) {
    const svg = renderHeroSvg({ ...base, user: { ...base.user, name } });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
    await writeFile(join(OUT, `${String(index).padStart(2, '0')}.png`), png);
    console.log(
      `${String(index).padStart(2, '0')}: ${name === null ? '(no name: the login)' : name}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
