import { describe, expect, it } from 'vitest';
import { placeTooltip } from './tooltip';

describe('placeTooltip', () => {
  it('goes below and to the right of the point by default', () => {
    expect(placeTooltip(100, 100, 200, 50, 1000, 800)).toEqual({ left: 116, top: 116 });
  });

  it('flips above the point when there is no room below', () => {
    expect(placeTooltip(100, 780, 200, 50, 1000, 800)).toEqual({ left: 116, top: 714 });
  });

  it('is kept inside the right edge of the viewport', () => {
    expect(placeTooltip(950, 100, 200, 50, 1000, 800)).toEqual({ left: 792, top: 116 });
  });

  it('never leaves the top of the viewport', () => {
    expect(placeTooltip(100, 10, 200, 300, 1000, 200).top).toBe(8);
  });
});
