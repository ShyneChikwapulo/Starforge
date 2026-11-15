import { basename } from 'node:path';
import type { GenerateResult } from './generate';

/**
 * Lines for $GITHUB_OUTPUT so later workflow steps know what was generated.
 * Every preset's files are listed (each variant dark first), then the profile card and the hero
 * card, then the preset cards, then the divider and the footer if there are any.
 * metrics.json is deliberately left out: it stays on the main branch.
 */
export function formatStepOutputs(result: GenerateResult): string {
  const files = [
    ...result.presets.flatMap((preset) =>
      preset.variants.flatMap((variant) => [variant.animation, variant.poster, variant.legend]),
    ),
    result.card,
    result.hero,
    ...result.presets.map((preset) => preset.presetCard),
    result.divider,
    result.footer,
  ]
    .filter((path): path is string => Boolean(path))
    .map((path) => basename(path));
  return `directory=${result.directory}\nfiles=${files.join(' ')}\n`;
}
