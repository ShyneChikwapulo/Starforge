import { basename } from 'node:path';
import type { GenerateResult } from './generate';

/**
 * Lines for $GITHUB_OUTPUT so later workflow steps know what was generated.
 * metrics.json is deliberately left out: it stays on the main branch.
 */
export function formatStepOutputs(result: GenerateResult): string {
  const files = [result.animation, result.poster, result.legend]
    .filter((path): path is string => Boolean(path))
    .map((path) => basename(path));
  return `directory=${result.directory}\nfiles=${files.join(' ')}\n`;
}
