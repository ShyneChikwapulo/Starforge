import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseMetrics } from '@starforge/github-data';
import { loadConfig } from './config';
import { generate } from './generate';
import { formatStepOutputs } from './outputs';

const USAGE = `Usage: starforge generate [--config <file>] [--metrics <file>]

  --config   Config file (default: starforge.config.json)
  --metrics  Use a saved metrics.json instead of calling the GitHub API

Set GITHUB_TOKEN to collect live data.`;

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const [command, ...rest] = args;
  if (command !== 'generate') {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }

  const option = (name: string): string | undefined => {
    const at = rest.indexOf(`--${name}`);
    return at >= 0 ? rest[at + 1] : undefined;
  };

  const cwd = process.env.INIT_CWD ?? process.cwd();
  const config = await loadConfig(resolve(cwd, option('config') ?? 'starforge.config.json'));
  const metricsFile = option('metrics');
  const metrics = metricsFile
    ? parseMetrics(JSON.parse(await readFile(resolve(cwd, metricsFile), 'utf8')))
    : undefined;

  const started = Date.now();
  const result = await generate({ config, metrics, token: process.env.GITHUB_TOKEN, cwd });

  for (const variant of result.variants) {
    console.log(`Wrote ${variant.animation}`);
    console.log(`Wrote ${variant.poster}`);
    if (variant.legend) console.log(`Wrote ${variant.legend}`);
  }
  if (result.metrics) console.log(`Metrics snapshot: ${result.metrics}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, formatStepOutputs(result));
  }
  const megabytes = result.variants.reduce((sum, v) => sum + v.animationBytes, 0) / 1_000_000;
  console.log(
    `${megabytes.toFixed(2)} MB ${result.variants.length > 1 ? 'of animations' : 'animation'}, ` +
      `done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
