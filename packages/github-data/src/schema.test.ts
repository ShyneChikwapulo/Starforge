import { describe, expect, it } from 'vitest';
import { createSampleMetrics } from './sample';
import { MetricsSchema, SCHEMA_VERSION, parseMetrics } from './schema';

describe('sample metrics', () => {
  it('validates against the schema', () => {
    expect(() => parseMetrics(createSampleMetrics())).not.toThrow();
  });

  it('is deterministic for a given seed', () => {
    expect(createSampleMetrics({ seed: 7 })).toEqual(createSampleMetrics({ seed: 7 }));
  });

  it('differs between seeds', () => {
    expect(createSampleMetrics({ seed: 1 })).not.toEqual(createSampleMetrics({ seed: 2 }));
  });

  it('covers 365 strictly ascending days', () => {
    const { calendar } = createSampleMetrics().contributions;
    expect(calendar).toHaveLength(365);
    for (let i = 1; i < calendar.length; i++) {
      expect(calendar[i]!.date > calendar[i - 1]!.date).toBe(true);
    }
  });
});

describe('MetricsSchema', () => {
  it('rejects an unknown schema version', () => {
    const bad = { ...createSampleMetrics(), schemaVersion: 3 };
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative star counts', () => {
    const m = createSampleMetrics();
    const bad = {
      ...m,
      repositories: m.repositories.map((r, i) => (i === 0 ? { ...r, stars: -1 } : r)),
    };
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects language shares that do not sum to 1', () => {
    const m = createSampleMetrics();
    const bad = { ...m, languages: m.languages.map((l) => ({ ...l, share: 0.01 })) };
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an inverted window', () => {
    const m = createSampleMetrics();
    const bad = { ...m, window: { from: m.window.to, to: m.window.from } };
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('schema v2', () => {
  it('stamps the current version', () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(createSampleMetrics().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('accepts null for every new section', () => {
    const m = {
      ...createSampleMetrics(),
      pullRequestStats: null,
      community: null,
      highlights: null,
    };
    expect(() => parseMetrics(m)).not.toThrow();
  });

  it('rejects a v2 snapshot that leaves a new section out', () => {
    const bad: Record<string, unknown> = { ...createSampleMetrics() };
    delete bad.community;
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative counts in the new sections', () => {
    const m = createSampleMetrics();
    const bad = { ...m, community: { ...m.community!, sponsors: -1 } };
    expect(MetricsSchema.safeParse(bad).success).toBe(false);
  });
});
