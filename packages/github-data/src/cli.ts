import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGraphQLClient } from './client';
import { collectMetrics } from './collect';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const login = args[0];
  const outFlag = args.indexOf('--out');
  const out = (outFlag >= 0 ? args[outFlag + 1] : undefined) ?? '.starforge/metrics.json';

  if (!login || login.startsWith('--')) {
    console.error('Usage: collect <github-login> [--out <path>]');
    process.exit(1);
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Set GITHUB_TOKEN (for local use: GITHUB_TOKEN=$(gh auth token)).');
    process.exit(1);
  }

  const metrics = await collectMetrics({ login, client: createGraphQLClient({ token }) });
  const target = resolve(process.env.INIT_CWD ?? process.cwd(), out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(metrics, null, 2)}\n`);

  console.log(
    `Wrote ${target}: ${metrics.repositories.length} repos, ` +
      `${metrics.languages.length} languages, ${metrics.contributions.calendar.length} days.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
