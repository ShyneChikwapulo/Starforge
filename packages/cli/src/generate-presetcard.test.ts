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
  cwd = await mkdtemp(join(tmpdir(), 'starforge-presetcard-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a preset card', () => {
  it('writes no preset card by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.presetCard).toBeUndefined();
    expect(await readdir(result.directory)).not.toContain('galaxy-card.svg');
  });

  it('writes <preset>-card.svg with the animation inside', async () => {
    const config = parseConfig({ ...small, preset: 'chess', presetCard: true });
    const result = await generate({ config, metrics, cwd });
    expect(result.presetCard).toBe(join(result.directory, 'chess-card.svg'));
    const svg = await readFile(result.presetCard!, 'utf8');
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('aria-label="CHESSBOARD"');
  });

  it('puts the card last in the list of files to publish', async () => {
    const config = parseConfig({ ...small, presetCard: true, card: true });
    const result = await generate({ config, metrics, cwd });
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg card.svg galaxy-card.svg\n`,
    );
  });
});
