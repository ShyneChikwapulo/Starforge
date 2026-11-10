import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PINNED_PRESETS, frameSums } from './pinned-look';

/**
 * How the default look rendered before themes existed. Light and dark pages are opt-in, so
 * a config that does not mention them must keep producing the same pictures. The sums are
 * compared with a small tolerance so a last-bit rounding difference between platforms cannot
 * fail the test, while any real change to colour, background or alpha still does.
 */
const pinned = JSON.parse(
  readFileSync(new URL('./__fixtures__/default-look.json', import.meta.url), 'utf8'),
) as Record<string, number[]>;

describe('the default look', () => {
  for (const id of PINNED_PRESETS) {
    it(`still renders ${id} as before`, () => {
      const actual = frameSums(id);
      const expected = pinned[id]!;
      expect(actual).toHaveLength(expected.length);
      actual.forEach((sum, i) => {
        expect(Math.abs(sum - expected[i]!) / expected[i]!).toBeLessThan(1e-4);
      });
    });
  }
});
