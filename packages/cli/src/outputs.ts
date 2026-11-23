import { basename } from 'node:path';
import type { GenerateResult } from './generate';

/**
 * Every file a run publishes, as full paths. Every preset's files come first (each variant dark
 * first), then the profile card and the hero card, then the preset cards, then the divider and the
 * footer if there are any. metrics.json is deliberately left out: it stays on the main branch.
 */
export function publishedPaths(result: GenerateResult): string[] {
  return [
    ...result.presets.flatMap((preset) =>
      preset.variants.flatMap((variant) => [variant.animation, variant.poster, variant.legend]),
    ),
    result.card,
    result.hero,
    ...result.presets.map((preset) => preset.presetCard),
    ...(result.infoCards ?? []),
    result.divider,
    result.footer,
  ].filter((path): path is string => Boolean(path));
}

/**
 * Lines for $GITHUB_OUTPUT so later workflow steps know what was generated: the folder, the files
 * to publish, and, when given, a version that changes whenever the images do.
 */
export function formatStepOutputs(result: GenerateResult, version?: string): string {
  const files = publishedPaths(result).map((path) => basename(path));
  const lines = [`directory=${result.directory}`, `files=${files.join(' ')}`];
  if (version) lines.push(`version=${version}`);
  return `${lines.join('\n')}\n`;
}
