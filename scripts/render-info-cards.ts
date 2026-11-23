/**
 * Renders every info card in each skin, from your saved metrics and from a stress case, to judge
 * them by eye.
 *
 *   pnpm exec tsx scripts/render-info-cards.ts
 *
 * Writes .starforge/info/<skin>-<card>.png and <skin>-stress-<card>.png.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { INFO_CARD_IDS, renderInfoCardSvg } from '../packages/exporters/src/index';
import { createSampleMetrics, parseMetrics, type Metrics } from '../packages/github-data/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.starforge', 'info');

function stressCase(base: Metrics): Metrics {
  const languages = Array.from({ length: 26 }, (_, i) => ({
    name: i === 3 ? 'Jupyter Notebook' : i === 7 ? 'Objective-C++' : `Language ${i + 1}`,
    color:
      i % 4 === 0 ? null : `#${(((i + 3) * 2654435) % 0xffffff).toString(16).padStart(6, '0')}`,
    bytes: Math.round(8_000_000 / (i + 1) ** 1.7),
    repoCount: 30 - i,
    share: 0,
  }));
  const total = languages.reduce((sum, l) => sum + l.bytes, 0);
  const calendar = base.contributions.calendar.map((day, i) => ({
    date: day.date,
    count: i === 120 ? 400 : (i * 7) % 11 === 0 ? 0 : ((i * 13) % 9) + (i > 200 ? 3 : 0),
  }));
  return {
    ...base,
    languages: languages.map((l) => ({ ...l, share: l.bytes / total })),
    contributions: { ...base.contributions, calendar },
  };
}

async function main(): Promise<void> {
  const saved = join(ROOT, '.starforge', 'metrics-v2.json');
  const real = existsSync(saved)
    ? parseMetrics(JSON.parse(readFileSync(saved, 'utf8')))
    : createSampleMetrics();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const cases: [string, Metrics][] = [
    ['', real],
    ['stress-', stressCase(real)],
  ];
  for (const skin of ['cyberpunk', 'default'] as const) {
    for (const [prefix, metrics] of cases) {
      if (prefix && skin === 'cyberpunk' && false) continue;
      for (const card of INFO_CARD_IDS) {
        const svg = renderInfoCardSvg(metrics, { card, skin });
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: 900 } }).render().asPng();
        await writeFile(join(OUT, `${skin}-${prefix}${card}.png`), png);
        console.log(`${skin}-${prefix}${card}: ${(svg.length / 1024).toFixed(0)} KB of SVG`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
