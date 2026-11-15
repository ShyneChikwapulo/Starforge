import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
  cwd = await mkdtemp(join(tmpdir(), 'starforge-presets-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with several presets', () => {
  it('writes every preset, in the order listed', async () => {
    const config = parseConfig({ ...small, presets: ['chess', 'galaxy'] });
    const result = await generate({ config, metrics, cwd });
    expect(result.presets.map((preset) => preset.id)).toEqual(['chess', 'galaxy']);
    const files = await readdir(result.directory);
    for (const name of ['chess.png', 'chess-legend.svg', 'galaxy.png', 'galaxy-legend.svg']) {
      expect(files).toContain(name);
    }
  });

  it('describes the first preset in the top-level fields', async () => {
    const config = parseConfig({ ...small, presets: ['chess', 'galaxy'] });
    const result = await generate({ config, metrics, cwd });
    expect(result.animation).toBe(join(result.directory, 'chess.png'));
    expect(result.variants).toBe(result.presets[0]!.variants);
  });

  it('ignores `preset` when `presets` is set', async () => {
    const config = parseConfig({ ...small, preset: 'tree', presets: ['galaxy'] });
    const result = await generate({ config, metrics, cwd });
    expect(await readdir(result.directory)).not.toContain('tree.png');
  });

  it('writes one card per preset, and shared pieces once', async () => {
    const config = parseConfig({
      ...small,
      presets: ['chess', 'galaxy'],
      presetCard: true,
      hero: true,
      page: true,
      divider: 'Presets',
    });
    const result = await generate({ config, metrics, cwd });
    expect(result.presets.map((preset) => preset.presetCard)).toEqual([
      join(result.directory, 'chess-card.svg'),
      join(result.directory, 'galaxy-card.svg'),
    ]);
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=` +
        'chess.png chess-poster.png chess-legend.svg galaxy.png galaxy-poster.png galaxy-legend.svg ' +
        'hero.svg chess-card.svg galaxy-card.svg divider.svg footer.svg\n',
    );
  });

  it('writes both themes for every preset', async () => {
    const config = parseConfig({ ...small, presets: ['chess', 'galaxy'], theme: 'both' });
    const result = await generate({ config, metrics, cwd });
    const files = await readdir(result.directory);
    for (const name of ['chess.png', 'chess-light.png', 'galaxy.png', 'galaxy-light.png']) {
      expect(files).toContain(name);
    }
  });

  it('keeps a single-preset run exactly as it was', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.presets).toHaveLength(1);
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg\n`,
    );
  });
});
