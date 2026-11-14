import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSampleMetrics } from '@starforge/github-data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from './config';
import { generate } from './generate';
import { formatStepOutputs } from './outputs';

const metrics = createSampleMetrics();
const small = { username: 'sample-user', width: 64, height: 32, frames: 3, format: 'apng' };

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-card-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a card', () => {
  it('writes no card by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.card).toBeUndefined();
    expect(await readdir(result.directory)).not.toContain('card.svg');
  });

  it('writes card.svg when asked', async () => {
    const result = await generate({ config: parseConfig({ ...small, card: true }), metrics, cwd });
    expect(result.card).toBe(join(result.directory, 'card.svg'));
    const svg = await readFile(result.card!, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(metrics.user.login);
  });

  it('puts the card in the list of files to publish', async () => {
    const result = await generate({ config: parseConfig({ ...small, card: true }), metrics, cwd });
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg card.svg\n`,
    );
  });
});
