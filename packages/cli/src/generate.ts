import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { encodeApng, encodePng, encodeWebp, renderGalaxyLoop } from '@starforge/exporters';
import { collectMetrics, createGraphQLClient, type Metrics } from '@starforge/github-data';
import type { StarforgeConfig } from './config';

export interface GenerateOptions {
  config: StarforgeConfig;
  /** GitHub token. Required unless `metrics` is supplied. */
  token?: string;
  /** Skip data collection and use these metrics (offline runs and tests). */
  metrics?: Metrics;
  /** Directory that `config.outputDir` is resolved against. Default: the current directory. */
  cwd?: string;
  /** Path to libwebp's img2webp, if it is not on PATH. */
  webpBinary?: string;
}

export interface GenerateResult {
  directory: string;
  animation: string;
  poster: string;
  /** Present when `saveMetrics` is enabled. */
  metrics?: string;
  animationBytes: number;
}

/**
 * Write the metrics snapshot, unless only its timestamp changed.
 * That keeps scheduled runs from producing a commit when nothing real changed.
 */
async function writeMetricsSnapshot(path: string, metrics: Metrics): Promise<void> {
  try {
    const previous = JSON.parse(await readFile(path, 'utf8')) as Metrics;
    const same =
      JSON.stringify({ ...previous, generatedAt: '' }) ===
      JSON.stringify({ ...metrics, generatedAt: '' });
    if (same) return;
  } catch {
    // No previous snapshot, or it is unreadable: write a fresh one.
  }
  await writeFile(path, `${JSON.stringify(metrics, null, 2)}\n`);
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const { config } = options;

  let metrics = options.metrics;
  if (!metrics) {
    if (!options.token) {
      throw new Error('GITHUB_TOKEN is required to collect data (or pass saved metrics).');
    }
    metrics = await collectMetrics({
      login: config.username,
      client: createGraphQLClient({ token: options.token }),
    });
  }

  const frames = renderGalaxyLoop(metrics, {
    width: config.width,
    height: config.height,
    frames: config.frames,
    seed: config.seed,
    bloom: config.bloom > 0 ? { strength: config.bloom, levels: 4 } : null,
  });
  const rgba = frames.map((frame) => frame.data);

  const animation =
    config.format === 'webp'
      ? await encodeWebp({
          width: config.width,
          height: config.height,
          frames: rgba,
          fps: config.fps,
          quality: config.quality,
          binary: options.webpBinary,
        })
      : encodeApng({ width: config.width, height: config.height, frames: rgba, fps: config.fps });
  const poster = encodePng(config.width, config.height, frames[0]!.data);

  const directory = resolve(options.cwd ?? process.cwd(), config.outputDir);
  await mkdir(directory, { recursive: true });

  const animationPath = join(directory, config.format === 'webp' ? 'galaxy.webp' : 'galaxy.png');
  const posterPath = join(directory, 'galaxy-poster.png');
  await writeFile(animationPath, animation);
  await writeFile(posterPath, poster);

  let metricsPath: string | undefined;
  if (config.saveMetrics) {
    metricsPath = join(directory, 'metrics.json');
    await writeMetricsSnapshot(metricsPath, metrics);
  }

  return {
    directory,
    animation: animationPath,
    poster: posterPath,
    metrics: metricsPath,
    animationBytes: animation.length,
  };
}
