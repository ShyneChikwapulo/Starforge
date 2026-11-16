import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

/**
 * A short hash of a set of files, by name and content. It changes whenever an image does, so a URL
 * ending in ?v=<version> is a new URL whenever the image behind it is new, and GitHub's image proxy
 * cannot serve a stale copy of it.
 */
export async function contentVersion(paths: string[]): Promise<string> {
  const hash = createHash('sha1');
  for (const path of paths) {
    hash.update(`${basename(path)}\0`);
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 10);
}
