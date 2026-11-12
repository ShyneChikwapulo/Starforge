import { orbitCamera } from '@starforge/renderer-canvas';
import { describe, expect, it } from 'vitest';
import { cameraFor } from './animation';

const camera = { yaw: 0.4, pitch: 0.6, distance: 30, fov: Math.PI / 4 };

describe('cameraFor', () => {
  it('orbits when the preset does not ask for a sway', () => {
    expect(cameraFor({}, camera, 0.3)).toEqual(orbitCamera(camera, 0.3));
  });

  it('swings either side of the starting yaw when it does', () => {
    const yawAt = (turn: number): number => cameraFor({ sway: 0.3 }, camera, turn).yaw;
    expect(yawAt(0)).toBeCloseTo(0.4, 12);
    expect(yawAt(0.25)).toBeCloseTo(0.7, 12);
    expect(yawAt(0.5)).toBeCloseTo(0.4, 12);
    expect(yawAt(0.75)).toBeCloseTo(0.1, 12);
    expect(yawAt(1)).toBeCloseTo(0.4, 12);
  });

  it('leaves the tilt, distance and field of view alone', () => {
    const swayed = cameraFor({ sway: 0.3 }, camera, 0.25);
    expect(swayed.pitch).toBe(camera.pitch);
    expect(swayed.distance).toBe(camera.distance);
    expect(swayed.fov).toBe(camera.fov);
  });
});
