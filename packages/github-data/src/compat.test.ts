import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, parseMetrics } from './schema';

/** A real v1 snapshot, frozen before schema v2. Never regenerate this file. */
const frozenV1 = JSON.parse(
  readFileSync(new URL('./__fixtures__/metrics-v1.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('v1 snapshots', () => {
  it('really are version 1 and have none of the new sections', () => {
    expect(frozenV1.schemaVersion).toBe(1);
    expect(frozenV1).not.toHaveProperty('pullRequestStats');
    expect(frozenV1).not.toHaveProperty('community');
    expect(frozenV1).not.toHaveProperty('highlights');
  });

  it('migrate to the current version and change nothing else', () => {
    expect(parseMetrics(frozenV1)).toEqual({
      ...frozenV1,
      schemaVersion: SCHEMA_VERSION,
      pullRequestStats: null,
      community: null,
      highlights: null,
    });
  });

  it('are still held to the v1 invariants', () => {
    const bad = { ...frozenV1, window: { from: '2026-01-02', to: '2026-01-01' } };
    expect(() => parseMetrics(bad)).toThrow();
  });

  it('are rejected when the version is unknown', () => {
    expect(() => parseMetrics({ ...frozenV1, schemaVersion: 3 })).toThrow();
  });

  it('give a v2 result that parses again unchanged', () => {
    const once = parseMetrics(frozenV1);
    expect(parseMetrics(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});
