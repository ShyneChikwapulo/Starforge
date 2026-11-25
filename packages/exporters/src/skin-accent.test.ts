import { describe, expect, it } from 'vitest';
import { accentProblem, contrastRatio, createDefaultSkin, normalizeHex } from './skin';

describe('normalizeHex', () => {
  it('expands #rgb, lowercases, and refuses anything else', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff');
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
    expect(normalizeHex('#3Fb')).toBe('#33ffbb');
    for (const bad of ['red', 'ff2e88', '#12345', '#1234567', '#ggg', '', 'rgb(0,0,0)']) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same colour', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#3fb950', '#3fb950')).toBe(1);
  });
});

describe('accentProblem', () => {
  it('accepts the default green, the cyberpunk yellow and white', () => {
    expect(accentProblem('#3fb950')).toBeNull();
    expect(accentProblem('#fcee09')).toBeNull();
    expect(accentProblem('#fff')).toBeNull();
  });

  it('says why a colour cannot be used, naming the ratio', () => {
    expect(accentProblem('#222222')).toMatch(/too dark.*\d+\.\d:1/);
    expect(accentProblem('pink')).toMatch(/must be a colour/);
  });
});

describe('createDefaultSkin', () => {
  it('changes only the accent', () => {
    expect(createDefaultSkin('#ff2e88').colors).toEqual({
      ...createDefaultSkin().colors,
      accent: '#ff2e88',
    });
  });
});
