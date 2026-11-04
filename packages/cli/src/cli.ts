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

  console.log(`Wrote ${result.animation}`);
  console.log(`Wrote ${result.poster}`);
  if (result.metrics) console.log(`Metrics snapshot: ${result.metrics}`);
  if (result.legend) console.log(`Wrote ${result.legend}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, formatStepOutputs(result));
  }
  console.log(
    `${(result.animationBytes / 1_000_000).toFixed(2)} MB animation, ` +
      `done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
