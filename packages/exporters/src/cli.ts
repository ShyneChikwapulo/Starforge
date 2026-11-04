import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Simulation } from '@starforge/core';
import { parseMetrics } from '@starforge/github-data';
import { buildGalaxy } from '@starforge/presets';
import { DEFAULT_CAMERA, orbitCamera, renderFrame } from '@starforge/renderer-canvas';
import { encodePng } from './png';

const args = process.argv.slice(2).filter((a) => a !== '--');
function option(name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] !== undefined ? (args[at + 1] as string) : fallback;
}

async function main(): Promise<void> {
  const base = process.env.INIT_CWD ?? process.cwd();
  const metricsPath = resolve(base, option('metrics', '.starforge/metrics.json'));
  const outPath = resolve(base, option('out', '.starforge/galaxy.png'));
  const width = Number(option('width', '1200'));
  const height = Number(option('height', '600'));
  const seed = Number(option('seed', '1'));
  const warmup = Number(option('warmup', '120'));
  const turn = Number(option('turn', '0'));
  const bloom = Number(option('bloom', '0'));

  const metrics = parseMetrics(JSON.parse(await readFile(metricsPath, 'utf8')));
  const { state, behaviours } = buildGalaxy(metrics, { seed });
  new Simulation({ state, behaviours, seed }).run(warmup);

  const frame = renderFrame(state, {
    width,
    height,
    camera: orbitCamera(DEFAULT_CAMERA, turn),
    background: [0.02, 0.03, 0.06],
    exposure: 1.4,
    bloom: bloom > 0 ? { strength: bloom, levels: 4 } : undefined,
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, encodePng(frame.width, frame.height, frame.data));
  console.log(`Wrote ${outPath} (${width}x${height}, ${state.count} particles, seed ${seed}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
