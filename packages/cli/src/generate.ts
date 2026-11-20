import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  encodeApng,
  encodePng,
  encodeWebp,
  renderCardSvg,
  renderFooterSvg,
  renderHeroSvg,
  renderLegendSvg,
  renderLoops,
  renderPresetCardSvg,
  renderSectionSvg,
} from '@starforge/exporters';
import { collectMetrics, createGraphQLClient, type Metrics } from '@starforge/github-data';
import { getPreset } from '@starforge/presets';
import { presetIds, type StarforgeConfig } from './config';
import { loadHeroCharacter } from './hero-character';
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

/** The files written for one preset. */
export interface GeneratedPreset {
  id: string;
  /** One variant per theme: two when `theme` is "both", otherwise one. */
  variants: GeneratedVariant[];
  /** Present when `presetCard` is enabled. */
  presetCard?: string;
}

export interface GenerateResult {
  directory: string;
  /** The first preset's first variant. For a single preset and theme, that is everything. */
  animation: string;
  poster: string;
  /** Present when `saveMetrics` is enabled. */
  metrics?: string;
  /** Present when `card` is enabled. */
  card?: string;
  /** Present when `hero` is enabled. */
  hero?: string;
  /** The first preset's card. Present when `presetCard` is enabled. */
  presetCard?: string;
  /** Present when `page` is enabled and a `divider` title is set. */
  divider?: string;
  /** Present when `page` is enabled. */
  footer?: string;
  /** Present when `legend` is enabled. */
  legend?: string;
  animationBytes: number;
  /** The first preset's variants, dark first. */
  variants: GeneratedVariant[];
  /** Every preset written, in the order the config lists them. */
  presets: GeneratedPreset[];
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

/** Render one preset in every look, and write its files. */
async function generatePreset(
  config: StarforgeConfig,
  id: StarforgeConfig['preset'],
  metrics: Metrics,
  looks: ReturnType<typeof resolveLooks>,
  directory: string,
  webpBinary: string | undefined,
): Promise<GeneratedPreset> {
  const preset = getPreset(id)!;
  const width = config.width ?? preset.size.width;
  const height = config.height ?? preset.size.height;
  const rendered = renderLoops(
    preset,
    metrics,
    { width, height, frames: config.frames, seed: config.seed },
    looks.map((resolved) => resolved.look),
  );

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
            binary: webpBinary,
          })
        : encodeApng({ width, height, frames: rgba, fps: config.fps });
    const poster = encodePng(width, height, frames[0]!.data);

    const name = `${id}${resolved.suffix}`;
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

  let presetCardPath: string | undefined;
  if (config.presetCard) {
    const source = variants.find((variant) => variant.theme === 'dark') ?? variants[0]!;
    const animation = await readFile(source.animation);
    const type = config.format === 'webp' ? 'image/webp' : 'image/png';
    presetCardPath = join(directory, `${id}-card.svg`);
    await writeFile(
      presetCardPath,
      renderPresetCardSvg(metrics, {
        stack: config.page ? 'none' : undefined,
        skin: config.skin,
        preset,
        media: { href: `data:${type};base64,${animation.toString('base64')}`, width, height },
      }),
    );
  }

  return { id, variants, presetCard: presetCardPath };
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

  const looks = resolveLooks(config);
  const directory = resolve(options.cwd ?? process.cwd(), config.outputDir);
  await mkdir(directory, { recursive: true });

  const presets: GeneratedPreset[] = [];
  for (const id of presetIds(config)) {
    presets.push(await generatePreset(config, id, metrics, looks, directory, options.webpBinary));
  }

  let metricsPath: string | undefined;
  if (config.saveMetrics) {
    metricsPath = join(directory, 'metrics.json');
    await writeMetricsSnapshot(metricsPath, metrics);
  }

  let cardPath: string | undefined;
  if (config.card) {
    cardPath = join(directory, 'card.svg');
    await writeFile(cardPath, renderCardSvg(metrics, { skin: config.skin }));
  }

  let heroPath: string | undefined;
  if (config.hero) {
    const character = config.heroCharacter
      ? await loadHeroCharacter(resolve(options.cwd ?? process.cwd(), config.heroCharacter))
      : undefined;
    heroPath = join(directory, 'hero.svg');
    await writeFile(
      heroPath,
      renderHeroSvg(metrics, {
        character,
        stack: config.page ? 'top' : undefined,
        skin: config.skin,
      }),
    );
  }

  let footerPath: string | undefined;
  let dividerPath: string | undefined;
  if (config.page) {
    footerPath = join(directory, 'footer.svg');
    await writeFile(footerPath, renderFooterSvg(metrics, { skin: config.skin }));
    if (config.divider) {
      dividerPath = join(directory, 'divider.svg');
      await writeFile(dividerPath, renderSectionSvg(config.divider, { skin: config.skin }));
    }
  }

  const first = presets[0]!;
  const firstVariant = first.variants[0]!;
  return {
    directory,
    animation: firstVariant.animation,
    poster: firstVariant.poster,
    metrics: metricsPath,
    card: cardPath,
    hero: heroPath,
    presetCard: first.presetCard,
    divider: dividerPath,
    footer: footerPath,
    legend: firstVariant.legend,
    animationBytes: firstVariant.animationBytes,
    variants: first.variants,
    presets,
  };
}
