import { createSampleMetrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { PRESET_IDS, getPreset } from './registry';

const sample = createSampleMetrics();

describe('preset registry', () => {
  it('finds every registered preset by id and gives each a legend', () => {
    for (const id of PRESET_IDS) {
      const preset = getPreset(id);
      expect(preset?.id).toBe(id);
      expect(preset?.legend.length).toBeGreaterThan(20);
    }
  });

  it('returns nothing for an unknown id, including inherited object keys', () => {
    expect(getPreset('nope')).toBeUndefined();
    expect(getPreset('constructor')).toBeUndefined();
  });

  it('builds every preset with the same particle count so they can morph into each other', () => {
    const counts = PRESET_IDS.map(
      (id) => getPreset(id)!.build(sample, { particleCount: 1500 }).state.count,
    );
    expect(new Set(counts).size).toBe(1);
  });
});
