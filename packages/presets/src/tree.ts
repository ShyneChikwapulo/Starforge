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
const MAX_REPOS = 100;
const MAX_LEAVES = 3000;
const DEFAULT_PARTICLES = 6000;
const GOLDEN_ANGLE = 2.399963229728653;
const TAU = Math.PI * 2;
const FALLBACK_COLOR = '#8b949e';

/** Shares of the non-data (dust) particles. The foliage haze takes whatever is left. */
const TRUNK_SHARE = 0.12;
const BRANCH_SHARE = 0.22;
const TWIG_SHARE = 0.15;
const MAX_TWIG_POINTS = 4;
const MAX_TWIG_LENGTH = 3;
/** How far a busy day's glow reaches into the surrounding foliage, in world units. */
const GLOW_RADIUS = 2.4;
/** Day tips avoid the inner crown: they keep points beyond this share of the local reach. */
const SHELL = 0.7;

const OLD: Rgb = [0.72, 0.55, 0.16];
const MID: Rgb = [0.12, 0.55, 0.2];
const NEW: Rgb = [0.55, 1, 0.3];
const BARK: Rgb = [0.5, 0.36, 0.22];

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

/** Fresh leaves are neon green; older ones fade through deep green to gold. 0 = oldest, 1 = newest. */
function recencyColor(t: number): Rgb {
  return t < 0.5 ? lerp(OLD, MID, t / 0.5) : lerp(MID, NEW, (t - 0.5) / 0.5);
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

function allPoints(points: Float32Array): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 3) {
    out.push({
      x: points[i] * SCALE,
      y: BASE_Y + points[i + 1] * SCALE,
      z: points[i + 2] * SCALE,
    });
  }
  return out;
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

function nearest(points: Point[], target: Point): { point: Point; distanceSq: number } {
  let best = points[0];
  let bestSq = Infinity;
  for (const p of points) {
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const dz = p.z - target.z;
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = p;
    }
  }
  return { point: best, distanceSq: bestSq };
}

/**
 * Data encodings:
 * - the crown climbs through time: one ring per calendar month, oldest lowest, days sweeping
 *   around each ring in date order
 * - one bright tip per day on the crown's outer shell (dim when nothing happened, larger and
 *   brighter when busy), joined to the nearest branch by a short twig
 * - one glowing leaf per contribution, clustered on its day's tip; fresher leaves are brighter
 *   green, older ones fade to gold. If there are more contributions than the leaf budget, leaf
 *   counts are scaled down proportionally
 * - roots are repositories, sized by stars
 * - the trunk and branches are the baked model's own, and the soft foliage haze is the baked
 *   crown itself, tinted by the nearest day and glowing near busy days: decoration that follows
 *   activity, not a count
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
  const wood = allPoints(silhouette.branches);
  const stems = tips.map((tip) => {
    const { point, distanceSq } = nearest(wood, tip);
    const distance = Math.sqrt(distanceSq);
    if (distance <= MAX_TWIG_LENGTH) return point;
    const f = MAX_TWIG_LENGTH / distance;
    return {
      x: tip.x + (point.x - tip.x) * f,
      y: tip.y + (point.y - tip.y) * f,
      z: tip.z + (point.z - tip.z) * f,
    };
  });

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
      0.7 + 1.4 * activity,
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

  // Leaves: one per contribution, up to a budget.
  const totalContributions = calendar.reduce((sum, day) => sum + day.count, 0);
  const leafBudget = Math.min(MAX_LEAVES, Math.floor(dustCount * 0.4));
  const leafCounts = allocate(
    calendar.map((day) => day.count),
    leafBudget,
  );
  const scaled = totalContributions > leafBudget;
  calendar.forEach((day, i) => {
    const tip = tips[i];
    const spread = 0.25 + 0.1 * Math.sqrt(Math.max(day.count, 1));
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
        tip.x + (rng() - 0.5) * 2 * spread,
        tip.y + (rng() - 0.5) * 2 * spread,
        tip.z + (rng() - 0.5) * 2 * spread,
        scaleColor(recencyColor(dayTime(i)), 0.75 + 0.25 * rng()),
        1.1 + 1.1 * rng(),
      );
    }
  });

  // Bark: the model's own trunk and branches, then a short twig from each tip.
  const bark = (x: number, y: number, z: number): void =>
    put(state, index++, x, y, z, scaleColor(BARK, 0.6 + 0.4 * rng()), 0.5 + 0.4 * rng());

  const trunkCount = Math.floor(dustCount * TRUNK_SHARE);
  for (let j = 0; j < trunkCount; j++) {
    const p = bakedPoint(silhouette.trunk, j, rng);
    bark(p.x, p.y, p.z);
  }
  const branchCount = Math.floor(dustCount * BRANCH_SHARE);
  for (let j = 0; j < branchCount; j++) {
    const p = bakedPoint(silhouette.branches, j, rng);
    bark(p.x, p.y, p.z);
  }

  const twigBudget = Math.floor(dustCount * TWIG_SHARE);
  const perTwig =
    calendar.length > 0 ? Math.min(MAX_TWIG_POINTS, Math.floor(twigBudget / calendar.length)) : 0;
  calendar.forEach((_, i) => {
    const tip = tips[i];
    const stem = stems[i];
    for (let j = 1; j <= perTwig; j++) {
      const f = j / (perTwig + 1);
      put(
        state,
        index++,
        stem.x + (tip.x - stem.x) * f,
        stem.y + (tip.y - stem.y) * f,
        stem.z + (tip.z - stem.z) * f,
        scaleColor(lerp(BARK, recencyColor(dayTime(i)), f * f), 0.55 + 0.3 * rng()),
        0.4 + 0.3 * rng(),
      );
    }
  });

  // Foliage haze: the baked crown. It fills the rest of the budget, so the whole outline is
  // always there, and each point takes its colour and glow from the nearest day.
  const hazeCount = state.count - index;
  for (let h = 0; h < hazeCount; h++) {
    const p = bakedPoint(silhouette.leaves, h, rng);
    if (calendar.length === 0) {
      put(state, index++, p.x, p.y, p.z, scaleColor(MID, 0.3 + 0.3 * rng()), 0.4 + 0.5 * rng());
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
    put(
      state,
      index++,
      p.x,
      p.y,
      p.z,
      scaleColor(recencyColor(dayTime(best)), 0.22 + 0.3 * rng() + 0.45 * glow),
      0.4 + 0.5 * rng() + 0.4 * glow,
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
  view: { yaw: 0.4, pitch: 0.12, distance: 38, fov: Math.PI / 4 },
  size: { width: 600, height: 800 },
  build: buildTree,
};
