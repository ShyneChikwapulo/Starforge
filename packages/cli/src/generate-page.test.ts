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
const CLOSED_FRAME = /<path d="M56,12 L1188,12[^"]*" fill="none" stroke=/;

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'starforge-page-'));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('generate with a page', () => {
  it('writes no footer or divider by default', async () => {
    const result = await generate({ config: parseConfig(small), metrics, cwd });
    expect(result.footer).toBeUndefined();
    expect(result.divider).toBeUndefined();
    const files = await readdir(result.directory);
    expect(files).not.toContain('footer.svg');
    expect(files).not.toContain('divider.svg');
  });

  it('writes a footer, and a divider when it has a title', async () => {
    const config = parseConfig({ ...small, page: true, divider: 'Presets' });
    const result = await generate({ config, metrics, cwd });
    expect(result.footer).toBe(join(result.directory, 'footer.svg'));
    expect(result.divider).toBe(join(result.directory, 'divider.svg'));
    expect(await readFile(result.divider!, 'utf8')).toContain('aria-label="PRESETS"');
  });

  it('writes a footer but no divider without a title', async () => {
    const result = await generate({ config: parseConfig({ ...small, page: true }), metrics, cwd });
    expect(result.footer).toBeDefined();
    expect(result.divider).toBeUndefined();
  });

  it('draws the hero and the preset card as pieces of the stack', async () => {
    const config = parseConfig({ ...small, hero: true, presetCard: true, page: true });
    const result = await generate({ config, metrics, cwd });
    for (const file of [result.hero!, result.presetCard!]) {
      expect(await readFile(file, 'utf8')).not.toMatch(CLOSED_FRAME);
    }
  });

  it('keeps the hero and the preset card standalone without page', async () => {
    const config = parseConfig({ ...small, hero: true, presetCard: true });
    const result = await generate({ config, metrics, cwd });
    for (const file of [result.hero!, result.presetCard!]) {
      expect(await readFile(file, 'utf8')).toMatch(CLOSED_FRAME);
    }
  });

  it('lists the pieces in page order', async () => {
    const config = parseConfig({
      ...small,
      hero: true,
      presetCard: true,
      page: true,
      divider: 'Presets',
    });
    const result = await generate({ config, metrics, cwd });
    expect(formatStepOutputs(result)).toBe(
      `directory=${result.directory}\nfiles=galaxy.png galaxy-poster.png galaxy-legend.svg hero.svg galaxy-card.svg divider.svg footer.svg\n`,
    );
  });
});
