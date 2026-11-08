import {
  createParticleState,
  createRng,
  drag,
  jitter,
  scatterInBox,
  spring,
  type ParticleState,
  type SolidBody,
  type SolidMesh,
} from '@starforge/core';
import type { Metrics } from '@starforge/github-data';
import { getKitten, getLanguageIcon, ICON_SIZE, type LanguageIcon } from './atom-assets';
import { dayEntity, repositoryEntity } from './entities';
import { GALAXY_MAX_ARMS } from './galaxy';
import { hexToRgb, logScale, scaleColor, type Rgb } from './scale';
import type { Entity, Preset, PresetOptions, PresetResult } from './types';

type Vec = [number, number, number];

/** The kitten's longest side, in world units. */
const KITTEN_SCALE = 14;
const MAX_REPOS = 100;
const DEFAULT_PARTICLES = 16000;
const GOLDEN_ANGLE = 2.399963229728653;
const TAU = Math.PI * 2;
/** The camera's starting yaw. The balls counter-spin against its orbit, so logos face it. */
const VIEW_YAW = Math.PI + 0.4;
const FALLBACK_COLOR = '#8b949e';

/** Shares of the non-data (dust) particles. The kitten takes whatever is left. */
const GLOW_SHARE = 0.12;
const STARFIELD_SHARE = 0.18;
/** The kitten is tuned for about this many particles; more of them dim each one in proportion. */
const BODY_REFERENCE = 4000;

const TUBE_RADIUS = 0.2;
const TUBE_SEGMENTS = 360;
const TUBE_AROUND = 10;
const LINK_RADIUS = 0.05;
const SPHERE_SEGMENTS = 160;
const SPHERE_RINGS = 80;
/** Half the width of a logo on a ball, as a share of the ball's radius. */
const LOGO_HALF = 0.64;

const RING_COLOR: Rgb = [0.45, 0.8, 1];
const LINK_COLOR: Rgb = [0.5, 0.78, 1];
const GLASS: Rgb = [0.05, 0.1, 0.17];
const DAY_OLD: Rgb = [0.25, 0.45, 0.95];
const DAY_NEW: Rgb = [0.85, 1, 1];

interface Ring {
  /** Semi-axes of the ellipse, in world units. */
  a: number;
  b: number;
  /** Rotation about x, then z, then y, in radians. */
  tilt: number;
  roll: number;
  turn: number;
  /** Whole revolutions per loop, negative for the other way round. */
  revolutions: number;
  phase: number;
}

const RINGS: Ring[] = [
  { a: 17, b: 11.5, tilt: 1.05, roll: 0.5, turn: 0, revolutions: 1, phase: 0 },
  { a: 17, b: 11.5, tilt: 1.05, roll: -0.5, turn: 0, revolutions: -1, phase: 0.8 },
  { a: 18.5, b: 13, tilt: 0.35, roll: 0.15, turn: 0.4, revolutions: 2, phase: 1.9 },
];

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rotate(ring: Ring, x: number, y: number, z: number): Vec {
  const ct = Math.cos(ring.tilt);
  const st = Math.sin(ring.tilt);
  const y1 = y * ct - z * st;
  const z1 = y * st + z * ct;
  const cr = Math.cos(ring.roll);
  const sr = Math.sin(ring.roll);
  const x2 = x * cr - y1 * sr;
  const y2 = x * sr + y1 * cr;
  const cy = Math.cos(ring.turn);
  const sy = Math.sin(ring.turn);
  return [x2 * cy + z1 * sy, y2, -x2 * sy + z1 * cy];
}

/** A point on a ring, at angle t round the ellipse. */
const ringPoint = (ring: Ring, t: number): Vec =>
  rotate(ring, ring.a * Math.cos(t), 0, ring.b * Math.sin(t));

function put(state: ParticleState, index: number, p: Vec, color: Rgb, size: number): void {
  const i = index * 3;
  state.target[i] = p[0];
  state.target[i + 1] = p[1];
  state.target[i + 2] = p[2];
  state.color[i] = color[0];
  state.color[i + 1] = color[1];
  state.color[i + 2] = color[2];
  state.size[index] = size;
}

/** The j-th baked kitten point in world units. Past the end it reuses points with a small jitter. */
function kittenPoint(points: Float32Array, j: number, rng: () => number): Vec {
  const total = points.length / 3;
  const i = j % total;
  const wobble = j >= total ? 0.012 : 0;
  const jitterBy = (): number => (wobble > 0 ? (rng() - 0.5) * wobble : 0);
  return [
    (points[i * 3] + jitterBy()) * KITTEN_SCALE,
    (points[i * 3 + 1] + jitterBy()) * KITTEN_SCALE,
    (points[i * 3 + 2] + jitterBy()) * KITTEN_SCALE,
  ];
}

interface Builder {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

const newBuilder = (): Builder => ({ positions: [], normals: [], colors: [], indices: [] });

function vertex(b: Builder, p: Vec, n: Vec, c: Rgb): number {
  b.positions.push(p[0], p[1], p[2]);
  b.normals.push(n[0], n[1], n[2]);
  b.colors.push(c[0], c[1], c[2]);
  return b.positions.length / 3 - 1;
}

function finish(b: Builder): SolidMesh {
  return {
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    colors: Float32Array.from(b.colors),
    indices: Uint32Array.from(b.indices),
  };
}

/** A tube along a ring. */
function addTube(b: Builder, ring: Ring, radius: number, color: Rgb): void {
  const base = b.positions.length / 3;
  const binormal = rotate(ring, 0, 1, 0);
  for (let i = 0; i <= TUBE_SEGMENTS; i++) {
    const t = (TAU * i) / TUBE_SEGMENTS;
    const centre = ringPoint(ring, t);
    const tx = -ring.a * Math.sin(t);
    const tz = ring.b * Math.cos(t);
    const length = Math.hypot(tx, tz);
    const m = rotate(ring, tz / length, 0, -tx / length);
    for (let j = 0; j < TUBE_AROUND; j++) {
      const angle = (TAU * j) / TUBE_AROUND;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const n: Vec = [
        c * m[0] + s * binormal[0],
        c * m[1] + s * binormal[1],
        c * m[2] + s * binormal[2],
      ];
      vertex(
        b,
        [centre[0] + radius * n[0], centre[1] + radius * n[1], centre[2] + radius * n[2]],
        n,
        color,
      );
    }
  }
  for (let i = 0; i < TUBE_SEGMENTS; i++) {
    for (let j = 0; j < TUBE_AROUND; j++) {
      const a = base + i * TUBE_AROUND + j;
      const c = base + i * TUBE_AROUND + ((j + 1) % TUBE_AROUND);
      b.indices.push(a, a + TUBE_AROUND, c, c, a + TUBE_AROUND, c + TUBE_AROUND);
    }
  }
}

/** Thin three-sided prisms for the constellation links, so they stay visible from every side. */
function addLinks(b: Builder, points: Float32Array, links: Uint16Array, color: Rgb): void {
  for (let k = 0; k < links.length; k += 2) {
    const from = links[k] * 3;
    const to = links[k + 1] * 3;
    const start: Vec = [
      points[from] * KITTEN_SCALE,
      points[from + 1] * KITTEN_SCALE,
      points[from + 2] * KITTEN_SCALE,
    ];
    const end: Vec = [
      points[to] * KITTEN_SCALE,
      points[to + 1] * KITTEN_SCALE,
      points[to + 2] * KITTEN_SCALE,
    ];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) continue;
    const d: Vec = [dx / length, dy / length, dz / length];
    const helper: Vec = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross = (u: Vec, v: Vec): Vec => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const p1 = cross(d, helper);
    const l1 = Math.hypot(p1[0], p1[1], p1[2]);
    p1[0] /= l1;
    p1[1] /= l1;
    p1[2] /= l1;
    const p2 = cross(d, p1);
    const base = b.positions.length / 3;
    for (const origin of [start, end]) {
      for (let s = 0; s < 3; s++) {
        const angle = (TAU * s) / 3;
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        const n: Vec = [c * p1[0] + sn * p2[0], c * p1[1] + sn * p2[1], c * p1[2] + sn * p2[2]];
        vertex(
          b,
          [
            origin[0] + LINK_RADIUS * n[0],
            origin[1] + LINK_RADIUS * n[1],
            origin[2] + LINK_RADIUS * n[2],
          ],
          n,
          color,
        );
      }
    }
    for (let s = 0; s < 3; s++) {
      const s2 = (s + 1) % 3;
      b.indices.push(base + s, base + 3 + s, base + s2, base + s2, base + 3 + s, base + 3 + s2);
    }
  }
}

/** Dark logo colours (Rust, Bash, Markdown) are lifted toward a light tone so they read on a dark ball. */
function lift(color: Rgb): Rgb {
  const luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  if (luma >= 0.3) return color;
  const t = 0.85 * (1 - luma / 0.3);
  return [
    color[0] + (0.86 - color[0]) * t,
    color[1] + (0.9 - color[1]) * t,
    color[2] + (0.96 - color[2]) * t,
  ];
}

/** Forward directions of the two logo faces, front and back: +z and -z. */
const FACES: [number, number][] = [
  [0, 1],
  [0, -1],
];

/** The logo colour at unit direction d on a ball, or null where the ball shows through. */
function logoColor(d: Vec, icon: LanguageIcon, palette: Rgb[]): Rgb | null {
  for (const [fx, fz] of FACES) {
    if (d[0] * fx + d[2] * fz < 0.35) continue;
    const u = d[0] * fz - d[2] * fx;
    const v = d[1];
    if (Math.abs(u) > LOGO_HALF || Math.abs(v) > LOGO_HALF) continue;
    const ix = Math.min(
      ICON_SIZE - 1,
      Math.max(0, Math.floor((0.5 + (0.5 * u) / LOGO_HALF) * ICON_SIZE)),
    );
    const iy = Math.min(
      ICON_SIZE - 1,
      Math.max(0, Math.floor((0.5 - (0.5 * v) / LOGO_HALF) * ICON_SIZE)),
    );
    const index = icon.pixels[iy * ICON_SIZE + ix];
    return index > 0 ? palette[index - 1] : null;
  }
  return null;
}

/** A glass-dark ball with the language's logo on four sides, centred on its own origin. */
function sphereMesh(radius: number, icon: LanguageIcon | undefined, language: Rgb): SolidMesh {
  const base = lerp(GLASS, language, icon ? 0.22 : 0.6);
  const palette = icon ? icon.palette.map(lift) : [];
  const b = newBuilder();
  for (let r = 0; r <= SPHERE_RINGS; r++) {
    const theta = (Math.PI * r) / SPHERE_RINGS;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let s = 0; s <= SPHERE_SEGMENTS; s++) {
      const phi = (TAU * s) / SPHERE_SEGMENTS;
      const d: Vec = [sinT * Math.sin(phi), cosT, sinT * Math.cos(phi)];
      const color = (icon ? logoColor(d, icon, palette) : null) ?? base;
      vertex(b, [d[0] * radius, d[1] * radius, d[2] * radius], d, color);
    }
  }
  for (let r = 0; r < SPHERE_RINGS; r++) {
    for (let s = 0; s < SPHERE_SEGMENTS; s++) {
      const a = r * (SPHERE_SEGMENTS + 1) + s;
      const c = a + SPHERE_SEGMENTS + 1;
      b.indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return finish(b);
}

/**
 * Data encodings:
 * - each ball is a language: its radius follows the square root of its share of your code, and it
 *   wears its logo on its front and back. The top six languages ride three interlocking rings, two to a
 *   ring, and every ring turns a whole number of times per loop so the animation loops cleanly
 * - the particle kitten at the centre is your year: each bright star is a calendar day, older
 *   days low and newer days high, dim when nothing happened and larger when busy
 * - the beads on the rings are repositories, sized by stars and coloured by language
 * - the thin lines between stars, the glow along the rings and the faint starfield are decoration
 *
 * It returns the same particle count as the other presets for the same input, so a viewer can
 * morph between them. The rings, the links and the balls are solid meshes, drawn crisp and lit
 * outside the glow.
 */
export function buildAtom(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const kitten = getKitten();
  const calendar = metrics.contributions.calendar;
  const repos = [...metrics.repositories]
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const languages = [...metrics.languages]
    .sort((a, b) => b.share - a.share)
    .slice(0, GALAXY_MAX_ARMS);

  const requested = options.particleCount ?? DEFAULT_PARTICLES;
  const dustCount = Math.max(0, requested - calendar.length - repos.length);
  const state = createParticleState(calendar.length + repos.length + dustCount);
  const entities: Entity[] = [];
  let index = 0;

  const maxDay = calendar.reduce((max, day) => Math.max(max, day.count), 0);
  const dayTime = (i: number): number => (calendar.length > 1 ? i / (calendar.length - 1) : 1);
  const scaled = (i: number): Vec => [
    kitten.points[i * 3] * KITTEN_SCALE,
    kitten.points[i * 3 + 1] * KITTEN_SCALE,
    kitten.points[i * 3 + 2] * KITTEN_SCALE,
  ];

  // Days: one star each, older days low on the kitten and newer days high.
  const byHeight = Array.from({ length: kitten.stars }, (_, i) => i).sort(
    (a, b) => kitten.points[a * 3 + 1] - kitten.points[b * 3 + 1],
  );
  calendar.forEach((day, i) => {
    const rank = Math.min(
      byHeight.length - 1,
      Math.floor(((i + 0.5) / calendar.length) * byHeight.length),
    );
    const activity = logScale(day.count, maxDay, 10);
    entities.push(dayEntity(index, day));
    put(
      state,
      index++,
      scaled(byHeight[rank]),
      scaleColor(lerp(DAY_OLD, DAY_NEW, dayTime(i)), day.count > 0 ? 1 : 0.3),
      0.9 + 1.6 * activity,
    );
  });

  // Repositories: beads on the rings.
  const maxStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
  const languageColor = new Map(
    metrics.languages.map((l) => [l.name, hexToRgb(l.color, FALLBACK_COLOR)] as const),
  );
  repos.forEach((repo, i) => {
    const color =
      (repo.primaryLanguage ? languageColor.get(repo.primaryLanguage) : undefined) ??
      hexToRgb(FALLBACK_COLOR);
    entities.push(repositoryEntity(index, repo));
    put(
      state,
      index++,
      ringPoint(RINGS[i % RINGS.length], i * GOLDEN_ANGLE),
      scaleColor(color, repo.isFork ? 0.6 : 1),
      1.5 + 3.5 * logScale(repo.stars, maxStars, 20),
    );
  });

  const glowCount = Math.floor(dustCount * GLOW_SHARE);
  const fieldCount = Math.floor(dustCount * STARFIELD_SHARE);
  const bodyCount = dustCount - glowCount - fieldCount;

  // The kitten: its stars brighter, the rest a soft cloud that thins out with more particles.
  const bodyGain = Math.min(1, Math.max(0.3, BODY_REFERENCE / Math.max(1, bodyCount)));
  for (let j = 0; j < bodyCount; j++) {
    const p = kittenPoint(kitten.points, j, rng);
    if (j < kitten.stars) {
      put(state, index++, p, scaleColor([0.85, 0.93, 1], 0.8), 0.9 + 0.4 * rng());
    } else {
      const tint = lerp([0.35, 0.6, 1], [0.7, 0.85, 1], rng());
      put(state, index++, p, scaleColor(tint, (0.5 + 0.4 * rng()) * bodyGain), 0.45 + 0.4 * rng());
    }
  }

  // Glow along the rings.
  const offset = (): number => (rng() + rng() + rng() - 1.5) * 0.5;
  for (let j = 0; j < glowCount; j++) {
    const ring = RINGS[j % RINGS.length];
    const centre = ringPoint(ring, TAU * rng());
    put(
      state,
      index++,
      [centre[0] + offset(), centre[1] + offset(), centre[2] + offset()],
      scaleColor([0.25, 0.6, 1], 0.35 + 0.4 * rng()),
      0.5 + 0.5 * rng(),
    );
  }

  // A faint, distant starfield.
  for (let j = 0; j < fieldCount; j++) {
    const z = 2 * rng() - 1;
    const phi = TAU * rng();
    const ring = Math.sqrt(1 - z * z);
    const radius = 24 + 20 * Math.sqrt(rng());
    put(
      state,
      index++,
      [radius * ring * Math.cos(phi), radius * z, radius * ring * Math.sin(phi)],
      scaleColor(lerp([0.6, 0.75, 1], [1, 1, 1], rng()), 0.18 + 0.4 * rng()),
      0.3 + 0.5 * rng(),
    );
  }

  if (options.startScattered) {
    scatterInBox(state, rng, 22);
  } else {
    state.position.set(state.target);
  }

  // Solid parts: the rings and the constellation links never move; the balls ride the rings.
  const fixed = newBuilder();
  for (const ring of RINGS) addTube(fixed, ring, TUBE_RADIUS, RING_COLOR);
  addLinks(fixed, kitten.points, kitten.links, LINK_COLOR);

  const topShare = languages[0]?.share ?? 1;
  const bodies: SolidBody[] = languages.map((language, i) => {
    const ring = RINGS[i % RINGS.length];
    const slot = Math.floor(i / RINGS.length);
    const onRing = Math.ceil((languages.length - (i % RINGS.length)) / RINGS.length);
    const phase = ring.phase + (TAU * slot) / onRing;
    const tilt = ((i % 3) - 1) * 0.18;
    const radius = 1.6 + 2.2 * Math.sqrt(language.share / topShare);
    return {
      mesh: sphereMesh(
        radius,
        getLanguageIcon(language.name),
        hexToRgb(language.color, FALLBACK_COLOR),
      ),
      label: {
        title: language.name,
        detail: `${(language.share * 100).toFixed(language.share < 0.1 ? 1 : 0)}% of your code`,
      },
      pose: (turns) => {
        const [x, y, z] = ringPoint(ring, phase + TAU * ring.revolutions * turns);
        return { x, y, z, spin: Math.PI - VIEW_YAW - TAU * turns + tilt };
      },
    };
  });

  return {
    state,
    seed,
    entities,
    mesh: finish(fixed),
    bodies,
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 0.3 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const atomPreset: Preset = {
  id: 'atom',
  name: 'Atom',
  legend:
    'Each ball is a language, sized by its share of your code and wearing its logo · the particle kitten at the centre is your year: each bright star is a day, newer days higher up, dim when quiet and larger when busy · the beads on the rings are repositories, sized by stars · the glow, the faint lines and the starfield are decoration',
  caption: 'Balls: languages by share · Stars: days, newer higher up · Ring beads: repositories',
  view: { yaw: VIEW_YAW, pitch: 0.22, distance: 54, fov: Math.PI / 4 },
  size: { width: 720, height: 720 },
  build: buildAtom,
};
