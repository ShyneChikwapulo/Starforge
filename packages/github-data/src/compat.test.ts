import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMetrics } from './schema';

/** A real v1 snapshot, frozen before schema v2. Never regenerate this file. */
const frozenV1 = JSON.parse(
  readFileSync(new URL('./__fixtures__/metrics-v1.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('v1 snapshots', () => {
  it('still parse', () => {
    expect(() => parseMetrics(frozenV1)).not.toThrow();
  });
});
