import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseMetrics } from '@starforge/github-data';
import { renderGalaxyLoop } from './animation';
import { encodeApng } from './apng';

const args = process.argv.slice(2).filter((a) => a !== '--');
function option(name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] !== undefined ? (args[at + 1] as string) : fallback;
}

async function main(): Promise<void> {
  const base = process.env.INIT_CWD ?? process.cwd();
  const metricsPath = resolve(base, option('metrics', '.starforge/metrics.json'));
  const outPath = resolve(base, option('out', '.starforge/galaxy-animated.png'));
  const width = Number(option('width', '800'));
  const height = Number(option('height', '400'));
  const frameCount = Number(option('frames', '60'));
  const fps = Number(option('fps', '15'));
  const seed = Number(option('seed', '1'));
  const bloom = Number(option('bloom', '0.9'));
  const transparent = args.includes('--transparent');

  const metrics = parseMetrics(JSON.parse(await readFile(metricsPath, 'utf8')));

  const started = Date.now();
  const frames = renderGalaxyLoop(metrics, {
    width,
    height,
    frames: frameCount,
    seed,
    background: transparent ? null : undefined,
    bloom: bloom > 0 ? { strength: bloom, levels: 4 } : null,
  });
  const rendered = Date.now();
  const apng = encodeApng({ width, height, frames: frames.map((f) => f.data), fps });
  const encoded = Date.now();

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, apng);

  console.log(`Wrote ${outPath}`);
  console.log(
    `${frameCount} frames at ${width}x${height}, ${fps} fps (${(frameCount / fps).toFixed(1)}s loop), ` +
      `${(apng.length / 1_000_000).toFixed(2)} MB`,
  );
  console.log(
    `render ${((rendered - started) / 1000).toFixed(1)}s, encode ${((encoded - rendered) / 1000).toFixed(1)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
