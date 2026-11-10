import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getPreset } from '@starforge/presets';
import { renderLegendSvg } from '@starforge/exporters';
import { join, resolve } from 'node:path';
import { encodeApng, encodePng, encodeWebp, renderLoops } from '@starforge/exporters';
import { collectMetrics, createGraphQLClient, type Metrics } from '@starforge/github-data';
import type { StarforgeConfig } from './config';
import { resolveLooks, type ThemeName } from './looks';

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

/** The files written for one theme. */
export interface GeneratedVariant {
  theme: ThemeName;
  animation: string;
  poster: string;
  /** Present when `legend` is enabled. */
  legend?: string;
  animationBytes: number;
}

export interface GenerateResult {
  directory: string;
  /** The first variant's files. For a single theme, that is everything. */
  animation: string;
  poster: string;
  /** Present when `saveMetrics` is enabled. */
  metrics?: string;
  /** Present when `legend` is enabled. */
  legend?: string;
  animationBytes: number;
  /** Every variant written, dark first. Two when `theme` is "both", otherwise one. */
  variants: GeneratedVariant[];
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

  const preset = getPreset(config.preset)!;
  const width = config.width ?? preset.size.width;
  const height = config.height ?? preset.size.height;
  const looks = resolveLooks(config);
  const rendered = renderLoops(
    preset,
    metrics,
    { width, height, frames: config.frames, seed: config.seed },
    looks.map((resolved) => resolved.look),
  );

  const directory = resolve(options.cwd ?? process.cwd(), config.outputDir);
  await mkdir(directory, { recursive: true });

  const variants: GeneratedVariant[] = [];
  for (const [index, resolved] of looks.entries()) {
    const frames = rendered[index]!;
    const rgba = frames.map((frame) => frame.data);

    const animation =
      config.format === 'webp'
        ? await encodeWebp({
            width,
            height,
            frames: rgba,
            fps: config.fps,
            quality: config.quality,
            binary: options.webpBinary,
          })
        : encodeApng({ width, height, frames: rgba, fps: config.fps });
    const poster = encodePng(width, height, frames[0]!.data);

    const name = `${config.preset}${resolved.suffix}`;
    const animationPath = join(directory, `${name}.${config.format === 'webp' ? 'webp' : 'png'}`);
    const posterPath = join(directory, `${name}-poster.png`);
    await writeFile(animationPath, animation);
    await writeFile(posterPath, poster);

    let legendPath: string | undefined;
    if (config.legend) {
      legendPath = join(directory, `${name}-legend.svg`);
      await writeFile(
        legendPath,
        renderLegendSvg(metrics, {
          width,
          caption: preset.caption,
          theme: resolved.theme,
          background: resolved.legendBackground,
        }),
      );
    }

    variants.push({
      theme: resolved.theme,
      animation: animationPath,
      poster: posterPath,
      legend: legendPath,
      animationBytes: animation.length,
    });
  }

  let metricsPath: string | undefined;
  if (config.saveMetrics) {
    metricsPath = join(directory, 'metrics.json');
    await writeMetricsSnapshot(metricsPath, metrics);
  }

  const first = variants[0]!;
  return {
    directory,
    animation: first.animation,
    poster: first.poster,
    metrics: metricsPath,
    legend: first.legend,
    animationBytes: first.animationBytes,
    variants,
  };
}
