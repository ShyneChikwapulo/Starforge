/**
 * Renders the README previews from the built-in sample data, so anyone can reproduce them
 * without a token and no personal data ends up in the repository.
 *
 *   pnpm examples
 *
 * It writes <preset>.webp and <preset>-legend.svg for every preset into .starforge/examples and
 * prints the command that publishes them to the `examples` branch, which the README links to.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig } from '../packages/cli/src/config';
import { generate } from '../packages/cli/src/generate';
import { createSampleMetrics } from '../packages/github-data/src/index';
import { PRESET_IDS, getPreset } from '../packages/presets/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = '.starforge/examples';
const WIDTH = 480;

async function main(): Promise<void> {
  const metrics = createSampleMetrics();
  const files: string[] = [];

  for (const id of PRESET_IDS) {
    const { size } = getPreset(id)!;
    const config = parseConfig({
      username: 'sample-user',
      preset: id,
      outputDir: OUTPUT_DIR,
      width: WIDTH,
      height: Math.round((WIDTH * size.height) / size.width),
      frames: 48,
      fps: 16,
      quality: 70,
      saveMetrics: false,
    });
    const started = Date.now();
    const result = await generate({ config, metrics, cwd: ROOT });
    files.push(`${id}.webp`, `${id}-legend.svg`);
    console.log(
      `${id}: ${(result.animationBytes / 1_000_000).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  }

  console.log('\nPublish them to the examples branch with:\n');
  console.log(
    `GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=ShyneChikwapulo/Starforge bash scripts/publish-assets.sh ${OUTPUT_DIR} examples ${files.join(' ')}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
