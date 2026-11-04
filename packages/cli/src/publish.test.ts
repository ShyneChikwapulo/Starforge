import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../scripts/publish-assets.sh', import.meta.url));

let root: string;
let source: string;
let remote: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'starforge-publish-'));
  source = join(root, 'source');
  remote = join(root, 'remote.git');
  await mkdir(source);
  execFileSync('git', ['init', '--bare', '-q', remote]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const publish = (...args: string[]) =>
  spawnSync('bash', [script, ...args], {
    env: { ...process.env, STARFORGE_REMOTE: `file://${remote}` },
    encoding: 'utf8',
  });

const git = (...args: string[]) =>
  execFileSync('git', ['-C', remote, ...args], { encoding: 'utf8' }).trim();

describe('publish-assets.sh', () => {
  it('publishes the listed files to a single-commit branch', async () => {
    await writeFile(join(source, 'a.txt'), 'one');
    await writeFile(join(source, 'b.svg'), '<svg/>');

    const result = publish(source, 'starforge-assets', 'a.txt', 'b.svg');
    expect(result.status).toBe(0);
    expect(git('log', '--oneline', 'starforge-assets').split('\n')).toHaveLength(1);
    expect(git('cat-file', '-p', 'starforge-assets:a.txt')).toBe('one');
  });

  it('replaces the branch instead of accumulating history', async () => {
    await writeFile(join(source, 'a.txt'), 'one');
    publish(source, 'starforge-assets', 'a.txt');
    await writeFile(join(source, 'a.txt'), 'two');
    const second = publish(source, 'starforge-assets', 'a.txt');

    expect(second.status).toBe(0);
    expect(git('log', '--oneline', 'starforge-assets').split('\n')).toHaveLength(1);
    expect(git('cat-file', '-p', 'starforge-assets:a.txt')).toBe('two');
  });

  it('does nothing when the files are unchanged', async () => {
    await writeFile(join(source, 'a.txt'), 'same');
    publish(source, 'starforge-assets', 'a.txt');
    const before = git('rev-parse', 'starforge-assets');

    const second = publish(source, 'starforge-assets', 'a.txt');
    expect(second.stdout).toContain('unchanged');
    expect(git('rev-parse', 'starforge-assets')).toBe(before);
  });

  it('publishes only the files it is told to', async () => {
    await writeFile(join(source, 'a.txt'), 'one');
    await writeFile(join(source, 'metrics.json'), '{}');
    publish(source, 'starforge-assets', 'a.txt');
    expect(git('ls-tree', '-r', '--name-only', 'starforge-assets')).toBe('a.txt');
  });

  it('prints usage when arguments are missing', () => {
    const result = publish();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage');
  });
});
