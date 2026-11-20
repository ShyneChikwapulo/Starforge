/**
 * Records a fingerprint of every card Starforge draws from the built-in sample data, so a
 * refactor can be shown to change nothing (or to change exactly what it meant to).
 *
 *   pnpm exec tsx scripts/snapshot-cards.ts baseline
 *   ...change the code...
 *   pnpm exec tsx scripts/snapshot-cards.ts after --compare=baseline
 *
 * Writes .starforge/snapshots/<label>/<name>.svg and index.json (name -> sha1 and size). With
 * --compare it lists what differs from the other label, and exits 1 if anything does.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderCardSvg,
  renderFooterSvg,
  renderHeroSvg,
  renderPresetCardSvg,
  renderSectionSvg,
} from '../packages/exporters/src/index';
import { createSampleMetrics } from '../packages/github-data/src/index';
import { PRESET_IDS, getPreset } from '../packages/presets/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOTS = join(ROOT, '.starforge', 'snapshots');
const label = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'snapshot';
const compare = process.argv.find((a) => a.startsWith('--compare='))?.slice(10);

const sha = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 12);

async function main(): Promise<void> {
  const metrics = createSampleMetrics();
  const character = {
    href: 'data:image/png;base64,AAAA',
    frameWidth: 380,
    frameHeight: 500,
    frames: 4,
    fps: 8,
  };
  const outputs: Record<string, string> = {
    card: renderCardSvg(metrics),
    hero: renderHeroSvg(metrics),
    'hero-character': renderHeroSvg(metrics, { character }),
    'hero-stack-top': renderHeroSvg(metrics, { stack: 'top' }),
    section: renderSectionSvg('Presets', { subtitle: 'Five ways to see one year' }),
    footer: renderFooterSvg(metrics),
  };
  for (const id of PRESET_IDS) {
    const preset = getPreset(id)!;
    const square = preset.size.width === preset.size.height;
    const media = {
      href: 'data:image/webp;base64,AAAA',
      width: preset.size.width,
      height: preset.size.height,
    };
    outputs[`preset-${id}`] = renderPresetCardSvg(metrics, { preset, media });
    outputs[`preset-${id}-stacked`] = renderPresetCardSvg(metrics, {
      preset,
      media,
      stack: 'none',
    });
    if (square)
      outputs[`preset-${id}-wide`] = renderPresetCardSvg(metrics, {
        preset,
        media,
        layout: 'wide',
      });
  }

  const dir = join(SNAPSHOTS, label);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const index: Record<string, { sha1: string; bytes: number }> = {};
  for (const [name, svg] of Object.entries(outputs)) {
    await writeFile(join(dir, `${name}.svg`), svg);
    index[name] = { sha1: sha(svg), bytes: svg.length };
  }
  await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`${label}: ${Object.keys(index).length} outputs recorded in ${dir}`);

  if (compare) {
    const otherFile = join(SNAPSHOTS, compare, 'index.json');
    if (!existsSync(otherFile)) throw new Error(`No snapshot named "${compare}".`);
    const other = JSON.parse(readFileSync(otherFile, 'utf8')) as typeof index;
    const names = new Set([...Object.keys(index), ...Object.keys(other)]);
    const changed = [...names].filter((n) => index[n]?.sha1 !== other[n]?.sha1);
    if (changed.length === 0) {
      console.log(`IDENTICAL to "${compare}": every output matches.`);
    } else {
      console.log(`DIFFERENT from "${compare}": ${changed.length} of ${names.size}`);
      for (const n of changed) {
        console.log(
          `  ${n}: ${other[n]?.bytes ?? 'absent'} -> ${index[n]?.bytes ?? 'absent'} bytes`,
        );
      }
      process.exit(1);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
