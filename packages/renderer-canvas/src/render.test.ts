import { createParticleState, type ParticleState, type SolidMesh } from '@starforge/core';
import { describe, expect, it } from 'vitest';
import { orbitCamera, renderFrame, type Camera, type Frame } from './render';

const CAMERA: Camera = { yaw: 0, pitch: 0, distance: 10, fov: Math.PI / 4 };
const W = 200;
const H = 100;

function particles(...points: { at: [number, number, number]; size?: number; rgb?: number }[]) {
  const state: ParticleState = createParticleState(points.length);
  points.forEach((point, p) => {
    state.position.set(point.at, p * 3);
    state.color.fill(point.rgb ?? 0.3, p * 3, p * 3 + 3);
    state.size[p] = point.size ?? 5;
  });
  return state;
}

function render(
  state: ParticleState,
  camera = CAMERA,
  background: [number, number, number] | null = [0, 0, 0],
) {
  return renderFrame(state, { width: W, height: H, camera, background });
}

function brightest(frame: Frame): { x: number; y: number; value: number } {
  let best = { x: 0, y: 0, value: -1 };
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const o = (y * frame.width + x) * 4;
      const value = frame.data[o] + frame.data[o + 1] + frame.data[o + 2];
      if (value > best.value) best = { x, y, value };
    }
  }
  return best;
}

describe('renderFrame', () => {
  it('fills an empty scene with the background colour', () => {
    const frame = render(createParticleState(0), CAMERA, [0, 0, 1]);
    expect(frame.data).toHaveLength(W * H * 4);
    expect(Array.from(frame.data.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(frame.data.subarray(-4))).toEqual([0, 0, 255, 255]);
  });

  it('draws a particle at the centre of the frame', () => {
    const peak = brightest(render(particles({ at: [0, 0, 0] })));
    expect(Math.abs(peak.x - W / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(peak.y - H / 2)).toBeLessThanOrEqual(1);
  });

  it('places +x on the right, and swaps sides after half an orbit', () => {
    const state = particles({ at: [5, 0, 0] });
    expect(brightest(render(state)).x).toBeGreaterThan(W / 2);
    expect(brightest(render(state, { ...CAMERA, yaw: Math.PI })).x).toBeLessThan(W / 2);
  });

  it('places +y above the centre', () => {
    expect(brightest(render(particles({ at: [0, 3, 0] }))).y).toBeLessThan(H / 2);
  });

  it('skips particles behind the camera', () => {
    const frame = render(particles({ at: [0, 0, -100] }));
    expect(brightest(frame).value).toBe(0);
  });

  it('adds overlapping light', () => {
    const one = brightest(render(particles({ at: [0, 0, 0] }))).value;
    const two = brightest(render(particles({ at: [0, 0, 0] }, { at: [0, 0, 0] }))).value;
    expect(two).toBeGreaterThan(one);
  });

  it('renders transparent backgrounds with alpha only where there is light', () => {
    const empty = render(createParticleState(0), CAMERA, null);
    expect(empty.data.every((v) => v === 0)).toBe(true);

    const lit = render(particles({ at: [0, 0, 0] }), CAMERA, null);
    const center = ((H / 2) * W + W / 2) * 4;
    expect(lit.data[center + 3]).toBeGreaterThan(0);
    expect(lit.data[3]).toBe(0);
  });

  it('is deterministic', () => {
    const state = particles({ at: [1, 2, 3] }, { at: [-2, 1, 0] });
    expect(render(state).data).toEqual(render(state).data);
  });
});

describe('orbitCamera', () => {
  it('advances yaw by whole turns', () => {
    expect(orbitCamera(CAMERA, 1).yaw).toBeCloseTo(Math.PI * 2);
    expect(orbitCamera(CAMERA, 0.25).yaw).toBeCloseTo(Math.PI / 2);
    expect(orbitCamera(CAMERA, 1).distance).toBe(CAMERA.distance);
  });
});

describe('renderFrame with a solid mesh', () => {
  const triangle: SolidMesh = {
    positions: new Float32Array([-3, -3, 0, 3, -3, 0, 0, 3, 0]),
    normals: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]),
    colors: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const options = {
    width: W,
    height: H,
    camera: CAMERA,
    background: [0, 0, 0] as [number, number, number],
    mesh: triangle,
  };
  const pixelAt = (frame: Frame, x: number, y: number) => {
    const o = (y * frame.width + x) * 4;
    return Array.from(frame.data.subarray(o, o + 4));
  };

  it('draws a lit, opaque triangle over the background', () => {
    const frame = renderFrame(createParticleState(0), options);
    const [r, g, , a] = pixelAt(frame, W / 2, H / 2);
    expect(r).toBeGreaterThan(80);
    expect(g).toBe(0);
    expect(a).toBe(255);
    expect(pixelAt(frame, 2, 2)).toEqual([0, 0, 0, 255]);
  });

  it('hides particles behind the mesh and keeps the ones in front', () => {
    const base = pixelAt(renderFrame(createParticleState(0), options), W / 2, H / 2);
    const behind = particles({ at: [0, 0, 2], size: 5, rgb: 1 });
    const front = particles({ at: [0, 0, -2], size: 5, rgb: 1 });
    expect(pixelAt(renderFrame(behind, options), W / 2, H / 2)).toEqual(base);
    expect(pixelAt(renderFrame(front, options), W / 2, H / 2)[1]).toBeGreaterThan(0);
  });

  it('keeps the mesh on a transparent background', () => {
    const frame = renderFrame(createParticleState(0), { ...options, background: null });
    const [r, , , a] = pixelAt(frame, W / 2, H / 2);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(80);
    expect(pixelAt(frame, 2, 2)[3]).toBe(0);
  });
});
