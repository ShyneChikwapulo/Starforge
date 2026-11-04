import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from './config';

describe('parseConfig', () => {
  it('fills in defaults', () => {
    expect(parseConfig({ username: 'octo' })).toMatchObject({
      username: 'octo',
      preset: 'galaxy',
      outputDir: 'starforge',
      format: 'webp',
      width: 800,
      height: 400,
      frames: 60,
      quality: 80,
      saveMetrics: true,
    });
  });

  it('requires a username', () => {
    expect(() => parseConfig({})).toThrow();
  });

  it('rejects unknown keys so typos are caught', () => {
    expect(() => parseConfig({ username: 'octo', colour: 'red' })).toThrow();
  });

  it('rejects out-of-range values', () => {
    expect(() => parseConfig({ username: 'octo', frames: 1 })).toThrow();
    expect(() => parseConfig({ username: 'octo', quality: 101 })).toThrow();
  });
});

describe('loadConfig', () => {
  it('reads and validates a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'starforge-config-'));
    try {
      await writeFile(join(dir, 'ok.json'), JSON.stringify({ username: 'octo', frames: 12 }));
      await writeFile(join(dir, 'bad.json'), '{ not json');
      await expect(loadConfig(join(dir, 'ok.json'))).resolves.toMatchObject({ frames: 12 });
      await expect(loadConfig(join(dir, 'bad.json'))).rejects.toThrow(/not valid JSON/);
      await expect(loadConfig(join(dir, 'missing.json'))).rejects.toThrow(/Cannot read/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
