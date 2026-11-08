import {
  createParticleState,
  createRng,
  drag,
  jitter,
  scatterInBox,
  spring,
  type ParticleState,
} from '@starforge/core';
import type { Metrics } from '@starforge/github-data';
import { dayEntity, repositoryEntity } from './entities';
import { hexToRgb, logScale, scaleColor, type Rgb } from './scale';
import { getSilhouette } from './tree-silhouette';
import type { Entity, Preset, PresetOptions, PresetResult } from './types';

/** World height of the tree and where its base sits; the baked silhouette is 1 tall. */
const SCALE = 20;
const BASE_Y = -10;
/** Rough horizontal reach of the crown, used to light its rim brighter than its core. */
const CROWN_RADIUS = SCALE * 0.65;
const MAX_REPOS = 100;
const MAX_LEAVES = 3000;
const DEFAULT_PARTICLES = 16000;
const GOLDEN_ANGLE = 2.399963229728653;
const TAU = Math.PI * 2;
const FALLBACK_COLOR = '#8b949e';

/** Shares of the non-data (dust) particles. The foliage haze takes whatever is left. */
const TRUNK_SHARE = 0.09;
const BRANCH_SHARE = 0.18;
/** How far a busy day's glow reaches into the surrounding foliage, in world units. */
const GLOW_RADIUS = 3;
/** Day tips avoid the inner crown: they keep points beyond this share of the local reach. */
const SHELL = 0.7;

/**
 * Recency ramp, 0 = oldest, 1 = newest: amber gold, lime, emerald, then a bright mint green.
 * The lime stop keeps gold-to-green from passing through a muddy olive.
 */
const RAMP: [number, Rgb][] = [
  [0, [0.95, 0.62, 0.15]],
  [0.3, [0.72, 0.82, 0.2]],
  [0.62, [0.12, 0.68, 0.34]],
  [1, [0.45, 1, 0.55]],
];
const FOLIAGE: Rgb = [0.12, 0.68, 0.34];
const BARK: Rgb = [0.55, 0.3, 0.2];

interface Point {
  x: number;
  y: number;
  z: number;
}

interface Month {
  key: string;
  /** Indices into the calendar, in date order. */
  days: number[];
}

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Fresh leaves are bright green; older ones fade through emerald and lime to gold. */
function recencyColor(t: number): Rgb {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [end, to] = RAMP[i];
    if (x <= end) {
      const [start, from] = RAMP[i - 1];
      return lerp(from, to, (x - start) / (end - start));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function groupMonths(calendar: Metrics['contributions']['calendar']): Month[] {
  const months: Month[] = [];
  calendar.forEach((day, i) => {
    const key = day.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.days.push(i);
    else months.push({ key, days: [i] });
  });
  return months;
}

/**
 * Share `budget` leaves between days in proportion to their counts (largest remainder method).
 * When the budget covers every contribution the counts are returned unchanged.
 */
function allocate(counts: number[], budget: number): number[] {
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum === 0 || budget <= 0) return counts.map(() => 0);
  if (sum <= budget) return counts.slice();

  const exact = counts.map((c) => (c * budget) / sum);
  const result = exact.map(Math.floor);
  let remaining = budget - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    result[index] += 1;
    remaining -= 1;
  }
  return result;
}

function put(
  state: ParticleState,
  index: number,
  x: number,
  y: number,
  z: number,
  color: Rgb,
  size: number,
): void {
  const i = index * 3;
  state.target[i] = x;
  state.target[i + 1] = y;
  state.target[i + 2] = z;
  state.color[i] = color[0];
  state.color[i + 1] = color[1];
  state.color[i + 2] = color[2];
  state.size[index] = size;
}

/** The j-th baked point in world units. Past the end it reuses points with a small jitter. */
function bakedPoint(points: Float32Array, j: number, rng: () => number): Point {
  const total = points.length / 3;
  const i = j % total;
  const wobble = j >= total ? 0.012 : 0;
  const jitterBy = (): number => (wobble > 0 ? (rng() - 0.5) * wobble : 0);
  return {
    x: (points[i * 3] + jitterBy()) * SCALE,
    y: BASE_Y + (points[i * 3 + 1] + jitterBy()) * SCALE,
    z: (points[i * 3 + 2] + jitterBy()) * SCALE,
  };
}

/**
 * Leaf points on the outer part of the crown, lowest first. "Outer" is relative to how far the
 * crown reaches at that height, so the trunk's fork and the tapering top are treated alike.
 */
function crownShell(leaves: Float32Array): Point[] {
  const bands = 24;
  const radii: number[][] = Array.from({ length: bands }, () => []);
  const entries: { point: Point; reach: number; band: number }[] = [];
  for (let i = 0; i < leaves.length; i += 3) {
    const reach = Math.hypot(leaves[i], leaves[i + 2]);
    const band = Math.min(bands - 1, Math.max(0, Math.floor(leaves[i + 1] * bands)));
    radii[band].push(reach);
    entries.push({
      point: {
        x: leaves[i] * SCALE,
        y: BASE_Y + leaves[i + 1] * SCALE,
        z: leaves[i + 2] * SCALE,
      },
      reach,
      band,
    });
  }
  const limits = radii.map((list) => {
    if (list.length === 0) return 0;
    list.sort((a, b) => a - b);
    return SHELL * list[Math.floor(list.length * 0.9)];
  });
  return entries
    .filter((entry) => entry.reach >= limits[entry.band])
    .map((entry) => entry.point)
    .sort((a, b) => a.y - b.y);
}

/**
 * One crown anchor per day. The crown is cut into height slices, one per calendar month and
 * proportional to its length, so time climbs the tree and each month is a ring. Inside a ring the
 * days sweep around the tree in date order, starting at a different angle each month.
 */
function placeAnchors(pool: Point[], months: Month[], total: number): Point[] {
  const anchors: Point[] = new Array(total);
  let consumed = 0;
  months.forEach((month, k) => {
    const days = month.days.length;
    const start = Math.min(
      Math.floor((consumed / total) * pool.length),
      Math.max(0, pool.length - days),
    );
    consumed += days;
    const end = Math.min(
      pool.length,
      Math.max(start + days, Math.floor((consumed / total) * pool.length)),
    );
    const phase = k * GOLDEN_ANGLE;
    const azimuth = (p: Point): number => (((Math.atan2(p.z, p.x) - phase) % TAU) + TAU) % TAU;
    const slice = pool.slice(start, end).sort((a, b) => azimuth(a) - azimuth(b));
    month.days.forEach((dayIndex, i) => {
      const pick = Math.min(slice.length - 1, Math.floor(((i + 0.5) / days) * slice.length));
      anchors[dayIndex] = slice[pick];
    });
  });
  return anchors;
}

/**
 * Data encodings:
 * - the crown climbs through time: one ring per calendar month, oldest lowest, days sweeping
 *   around each ring in date order
 * - one bright tip per day on the crown's outer shell (dim when nothing happened, larger and
 *   brighter when busy)
 * - one glowing leaf per contribution, in a soft cloud around its day's tip; fresher leaves are
 *   brighter green, older ones fade to gold. If there are more contributions than the leaf
 *   budget, leaf counts are scaled down proportionally
 * - roots are repositories, sized by stars
 * - the trunk and branches are the baked model's own, and the soft foliage haze is the baked
 *   crown itself, tinted by the nearest day, brighter on the rim and glowing near busy days:
 *   decoration that follows activity, not a count
 *
 * It returns the same particle count as the other presets for the same input, so a viewer can
 * morph between them.
 */
export function buildTree(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const silhouette = getSilhouette();
  const calendar = metrics.contributions.calendar;
  const repos = [...metrics.repositories]
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const requested = options.particleCount ?? DEFAULT_PARTICLES;
  const dustCount = Math.max(0, requested - calendar.length - repos.length);
  const state = createParticleState(calendar.length + repos.length + dustCount);
  const entities: Entity[] = [];
  let index = 0;

  const months = groupMonths(calendar);
  const maxDay = calendar.reduce((max, day) => Math.max(max, day.count), 0);
  const dayTime = (i: number): number => (calendar.length > 1 ? i / (calendar.length - 1) : 1);

  const tips = placeAnchors(crownShell(silhouette.leaves), months, calendar.length);

  // Tips: one per day.
  calendar.forEach((day, i) => {
    const activity = logScale(day.count, maxDay, 10);
    const tip = tips[i];
    entities.push(dayEntity(index, day));
    put(
      state,
      index++,
      tip.x,
      tip.y,
      tip.z,
      scaleColor(recencyColor(dayTime(i)), day.count > 0 ? 1 : 0.3),
      0.7 + 1.2 * activity,
    );
  });

  // Roots: one per repository.
  const maxStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
  const languageColor = new Map(
    metrics.languages.map((l) => [l.name, hexToRgb(l.color, FALLBACK_COLOR)] as const),
  );
  repos.forEach((repo, i) => {
    const angle = i * GOLDEN_ANGLE;
    const radius = 2 + 4.5 * Math.sqrt((i + 0.5) / repos.length);
    const baseColor =
      (repo.primaryLanguage ? languageColor.get(repo.primaryLanguage) : undefined) ??
      hexToRgb(FALLBACK_COLOR);
    entities.push(repositoryEntity(index, repo));
    put(
      state,
      index++,
      Math.cos(angle) * radius,
      BASE_Y - 0.4 - 0.8 * rng(),
      Math.sin(angle) * radius,
      scaleColor(baseColor, repo.isFork ? 0.6 : 1),
      1.5 + 4.5 * logScale(repo.stars, maxStars, 20),
    );
  });

  // Leaves: one per contribution, up to a budget, in a soft cloud around the day's tip.
  const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);
  const leafBudget = Math.min(MAX_LEAVES, Math.floor(dustCount * 0.4));
  const leafCounts = allocate(
    calendar.map((day) => day.count),
    leafBudget,
  );
  const scaled = totalContributions > leafBudget;
  const cloud = (): number => rng() + rng() + rng() - 1.5;
  calendar.forEach((day, i) => {
    const tip = tips[i];
    const spread = 0.5 + 0.18 * Math.sqrt(Math.max(day.count, 1));
    for (let j = 0; j < leafCounts[i]; j++) {
      entities.push({
        particle: index,
        kind: 'contribution',
        title: day.date,
        detail: scaled
          ? `part of ${count(day.count, 'contribution', 'contributions')} that day`
          : `contribution ${j + 1} of ${day.count}`,
      });
      put(
        state,
        index++,
        tip.x + cloud() * spread,
        tip.y + cloud() * spread,
        tip.z + cloud() * spread,
        scaleColor(recencyColor(dayTime(i)), 0.6 + 0.3 * rng()),
        0.9 + 0.8 * rng(),
      );
    }
  });

  // Bark: the model's own trunk and branches.
  const bark = (p: Point): void =>
    put(state, index++, p.x, p.y, p.z, scaleColor(BARK, 0.6 + 0.4 * rng()), 0.5 + 0.4 * rng());
  const trunkCount = Math.floor(dustCount * TRUNK_SHARE);
  for (let j = 0; j < trunkCount; j++) bark(bakedPoint(silhouette.trunk, j, rng));
  const branchCount = Math.floor(dustCount * BRANCH_SHARE);
  for (let j = 0; j < branchCount; j++) bark(bakedPoint(silhouette.branches, j, rng));

  // Foliage haze: the baked crown. It fills the rest of the budget, so the whole outline is
  // always there, and each point takes its colour and glow from the nearest day.
  const hazeCount = state.count - index;
  for (let h = 0; h < hazeCount; h++) {
    const p = bakedPoint(silhouette.leaves, h, rng);
    if (calendar.length === 0) {
      put(state, index++, p.x, p.y, p.z, scaleColor(FOLIAGE, 0.3 + 0.3 * rng()), 0.4 + 0.5 * rng());
      continue;
    }
    let best = 0;
    let bestSq = Infinity;
    for (let i = 0; i < tips.length; i++) {
      const dx = tips[i].x - p.x;
      const dy = tips[i].y - p.y;
      const dz = tips[i].z - p.z;
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        best = i;
      }
    }
    const activity = logScale(calendar[best].count, maxDay, 10);
    const glow = activity * Math.exp(-bestSq / (2 * GLOW_RADIUS * GLOW_RADIUS));
    const rim = Math.min(1, Math.hypot(p.x, p.z) / CROWN_RADIUS);
    const body = (0.45 + 0.3 * rng()) * (0.65 + 0.55 * rim);
    put(
      state,
      index++,
      p.x,
      p.y,
      p.z,
      scaleColor(recencyColor(dayTime(best)), Math.min(1, body + 0.35 * glow)),
      0.45 + 0.45 * rng() + 0.25 * glow,
    );
  }

  if (options.startScattered) {
    scatterInBox(state, rng, SCALE * 0.7);
  } else {
    state.position.set(state.target);
  }

  return {
    state,
    seed,
    entities,
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 0.55 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const treePreset: Preset = {
  id: 'tree',
  name: 'Tree',
  legend:
    'The crown climbs through time, one ring per month, oldest at the bottom · each bright tip is a day, dim when quiet · each glowing leaf is a contribution, fresher leaves are brighter green and older ones fade to gold (scaled down only for very busy years) · roots are repositories, sized by stars · the soft foliage haze is decoration that follows activity',
  caption:
    'Height: time, a ring per month · Tips: days · Leaves: contributions · Roots: repositories',
  view: { yaw: 0.4, pitch: 0.12, distance: 36, fov: Math.PI / 4 },
  size: { width: 720, height: 720 },
  build: buildTree,
};
