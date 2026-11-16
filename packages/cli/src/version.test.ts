import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentVersion } from './version';

let a: string;
let b: string;
beforeEach(async () => {
  a = await mkdtemp(join(tmpdir(), 'starforge-version-a-'));
  b = await mkdtemp(join(tmpdir(), 'starforge-version-b-'));
});
afterEach(async () => {
  await rm(a, { recursive: true, force: true });
  await rm(b, { recursive: true, force: true });
});

describe('contentVersion', () => {
  it('is ten hex characters', async () => {
    await writeFile(join(a, 'hero.svg'), 'one');
    expect(await contentVersion([join(a, 'hero.svg')])).toMatch(/^[0-9a-f]{10}$/);
  });

  it('is the same for the same files, wherever they live', async () => {
    await writeFile(join(a, 'hero.svg'), 'one');
    await writeFile(join(b, 'hero.svg'), 'one');
    expect(await contentVersion([join(a, 'hero.svg')])).toBe(
      await contentVersion([join(b, 'hero.svg')]),
    );
  });

  it('changes when a file changes', async () => {
    await writeFile(join(a, 'hero.svg'), 'one');
    await writeFile(join(b, 'hero.svg'), 'two');
    expect(await contentVersion([join(a, 'hero.svg')])).not.toBe(
      await contentVersion([join(b, 'hero.svg')]),
    );
  });

  it('changes when a file is renamed', async () => {
    await writeFile(join(a, 'hero.svg'), 'one');
    await writeFile(join(b, 'footer.svg'), 'one');
    expect(await contentVersion([join(a, 'hero.svg')])).not.toBe(
      await contentVersion([join(b, 'footer.svg')]),
    );
  });

  it('changes when a file is added', async () => {
    await writeFile(join(a, 'hero.svg'), 'one');
    await writeFile(join(a, 'footer.svg'), 'two');
    const one = await contentVersion([join(a, 'hero.svg')]);
    const both = await contentVersion([join(a, 'hero.svg'), join(a, 'footer.svg')]);
    expect(both).not.toBe(one);
  });
});
