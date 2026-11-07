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
import type { Entity, Preset, PresetOptions, PresetResult } from './types';

const BASE_Y = -10;
const HEIGHT = 20;
const MAX_REPOS = 100;
const MAX_LEAVES = 3000;
const DEFAULT_PARTICLES = 6000;
const GOLDEN_ANGLE = 2.399963229728653;
const TAU = Math.PI * 2;
const FALLBACK_COLOR = '#8b949e';

const OLD: Rgb = [0.72, 0.55, 0.16];
const MID: Rgb = [0.12, 0.55, 0.2];
const NEW: Rgb = [0.55, 1, 0.3];
const BARK: Rgb = [0.42, 0.33, 0.2];
const SAP: Rgb = [0.25, 0.75, 0.35];

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

const spine = (y: number): { x: number; z: number } => ({
  x: 0.7 * Math.sin(y * 0.31 + 0.4),
  z: 0.7 * Math.cos(y * 0.23),
});

const trunkRadius = (y: number): number => 1.5 * (1 - 0.55 * ((y - BASE_Y) / HEIGHT)) + 0.12;

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

/**
 * Data encodings:
 * - the trunk grows bottom to top through time: one branch per calendar month, oldest lowest
 * - one twig per day (bare and dim when nothing happened, longer and brighter when busy)
 * - one glowing leaf per contribution, clustered on its day's twig; fresher leaves are brighter
 *   green, older ones fade to gold. If there are more contributions than the leaf budget, leaf
 *   counts are scaled down proportionally
 * - roots are repositories, sized by stars
 * - the soft foliage haze is decoration that follows activity, not a count
 *
 * It returns the same particle count as the other presets for the same input, so a viewer can
 * morph between them.
 */
export function buildTree(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
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

  const branchHeight = (k: number): number =>
    BASE_Y + HEIGHT * (0.16 + 0.8 * ((k + 0.5) / months.length));
  const branchLength = (k: number): number =>
    9 - 5 * (months.length > 1 ? k / (months.length - 1) : 0.5);
  const branchAzimuth = (k: number): number => k * GOLDEN_ANGLE;

  const branchPoint = (k: number, u: number): Point => {
    const y0 = branchHeight(k);
    const base = spine(y0);
    const azimuth = branchAzimuth(k);
    const reach = branchLength(k) * u;
    const wobble = 0.5 * Math.sin(u * 5 + k);
    return {
      x: base.x + Math.cos(azimuth) * reach - Math.sin(azimuth) * wobble,
      y: y0 + 2.4 * u - 1.8 * u * u,
      z: base.z + Math.sin(azimuth) * reach + Math.cos(azimuth) * wobble,
    };
  };

  const anchors: Point[] = new Array(calendar.length);
  const tips: Point[] = new Array(calendar.length);
  months.forEach((month, k) => {
    month.days.forEach((dayIndex, i) => {
      const day = calendar[dayIndex];
      const u = 0.3 + 0.7 * ((i + 0.5) / month.days.length);
      const anchor = branchPoint(k, u);
      const activity = logScale(day.count, maxDay, 10);
      const side = i % 2 === 0 ? 1 : -1;
      const azimuth = branchAzimuth(k) + (Math.PI / 2) * side;
      const length = 0.5 + 0.9 * activity;
      anchors[dayIndex] = anchor;
      tips[dayIndex] = {
        x: anchor.x + Math.cos(azimuth) * length,
        y: anchor.y + 0.3 + 0.4 * activity,
        z: anchor.z + Math.sin(azimuth) * length,
      };
    });
  });

  // Twig tips: one per day.
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
      0.5 + 1.2 * activity,
    );
  });

  // Roots: one per repository.
  const maxStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
  const languageColor = new Map(
    metrics.languages.map((l) => [l.name, hexToRgb(l.color, FALLBACK_COLOR)] as const),
  );
  repos.forEach((repo, i) => {
    const angle = i * GOLDEN_ANGLE;
    const radius = 1.8 + 3.2 * Math.sqrt((i + 0.5) / repos.length);
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
    const spread = 0.3 + 0.16 * Math.sqrt(Math.max(day.count, 1));
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
        tip.y + (rng() - 0.2) * spread,
        tip.z + (rng() - 0.5) * 2 * spread,
        scaleColor(recencyColor(dayTime(i)), 0.75 + 0.25 * rng()),
        1.1 + 1.1 * rng(),
      );
    }
  });

  // Bark: twisted trunk strands, month branches and short twigs.
  const barkBudget = Math.floor(dustCount * 0.3);
  const trunkBudget = Math.floor(barkBudget * 0.4);
  const branchBudget = Math.floor(barkBudget * 0.4);
  const twigBudget = barkBudget - trunkBudget - branchBudget;

  const strands = 4;
  const perStrand = Math.floor(trunkBudget / strands);
  for (let s = 0; s < strands; s++) {
    for (let i = 0; i < perStrand; i++) {
      const y = BASE_Y + HEIGHT * (perStrand > 1 ? i / (perStrand - 1) : 0.5);
      const center = spine(y);
      const theta = 0.5 * (y - BASE_Y) + (s * TAU) / strands;
      const radius = trunkRadius(y);
      put(
        state,
        index++,
        center.x + Math.cos(theta) * radius,
        y,
        center.z + Math.sin(theta) * radius,
        scaleColor(s % 2 === 0 ? SAP : BARK, 0.6 + 0.4 * rng()),
        0.5 + 0.4 * rng(),
      );
    }
  }

  const perBranch = months.length > 0 ? Math.floor(branchBudget / months.length) : 0;
  months.forEach((_, k) => {
    for (let i = 0; i < perBranch; i++) {
      const u = perBranch > 1 ? i / (perBranch - 1) : 0.5;
      const point = branchPoint(k, u);
      const wiggle = 0.1 + 0.15 * (1 - u);
      put(
        state,
        index++,
        point.x + (rng() - 0.5) * wiggle,
        point.y + (rng() - 0.5) * wiggle,
        point.z + (rng() - 0.5) * wiggle,
        scaleColor(BARK, 0.6 + 0.4 * rng()),
        0.5 + 0.4 * rng(),
      );
    }
  });

  const perTwig = calendar.length > 0 ? Math.floor(twigBudget / calendar.length) : 0;
  calendar.forEach((_, i) => {
    const anchor = anchors[i];
    const tip = tips[i];
    for (let j = 1; j <= perTwig; j++) {
      const f = j / (perTwig + 1);
      put(
        state,
        index++,
        anchor.x + (tip.x - anchor.x) * f,
        anchor.y + (tip.y - anchor.y) * f,
        anchor.z + (tip.z - anchor.z) * f,
        scaleColor(BARK, 0.6 + 0.3 * rng()),
        0.4 + 0.3 * rng(),
      );
    }
  });

  // Foliage haze: decoration that thickens around busy days. It fills the rest of the budget.
  const weights = calendar.map((day) => day.count + 0.15);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  while (index < state.count) {
    if (calendar.length === 0) {
      put(
        state,
        index++,
        (rng() - 0.5) * 12,
        (rng() - 0.5) * 16,
        (rng() - 0.5) * 12,
        scaleColor(MID, 0.3 + 0.3 * rng()),
        0.4 + 0.4 * rng(),
      );
      continue;
    }
    let pick = rng() * totalWeight;
    let i = 0;
    while (i < weights.length - 1 && pick >= weights[i]) {
      pick -= weights[i];
      i++;
    }
    const tip = tips[i];
    const spread = 0.5 + 0.35 * Math.sqrt(calendar[i].count);
    put(
      state,
      index++,
      tip.x + (rng() - 0.5) * 2 * spread,
      tip.y + (rng() - 0.3) * spread,
      tip.z + (rng() - 0.5) * 2 * spread,
      scaleColor(recencyColor(dayTime(i)), 0.25 + 0.3 * rng()),
      0.4 + 0.5 * rng(),
    );
  }

  if (options.startScattered) {
    scatterInBox(state, rng, HEIGHT / 2);
  } else {
    state.position.set(state.target);
  }

  return {
    state,
    seed,
    entities,
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 0.7 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const treePreset: Preset = {
  id: 'tree',
  name: 'Tree',
  legend:
    'Branches are months, oldest at the bottom · each twig is a day, bare when quiet · each glowing leaf is a contribution, fresher leaves are brighter (scaled down only for very busy years) · roots are repositories, sized by stars · the soft foliage haze is decoration that follows activity',
  caption:
    'Branches: months, oldest at the bottom · Leaves: contributions · Twigs: days · Roots: repositories',
  view: { yaw: 0.4, pitch: 0.12, distance: 40, fov: Math.PI / 4 },
  size: { width: 600, height: 800 },
  build: buildTree,
};
