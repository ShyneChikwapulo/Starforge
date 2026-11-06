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
import { hashString, hexToRgb, logScale, rootWeights, scaleColor, type Rgb } from './scale';
import type { Entity, Preset, PresetOptions, PresetResult } from './types';

const LENGTH = 30;
const RADIUS = 6;
const MAX_SECTORS = 6;
const MAX_REPOS = 100;
const DEFAULT_PARTICLES = 6000;
const GOLDEN_ANGLE = 2.399963229728653;
const TAU = Math.PI * 2;
const FALLBACK_COLOR = '#8b949e';
const RING_COLOR = '#ffd27a';

interface Sector {
  name: string | null;
  color: Rgb;
  /** Start angle and angular width, in radians. Sectors tile the full circle. */
  start: number;
  span: number;
}

function buildSectors(metrics: Metrics): Sector[] {
  const top = metrics.languages.slice(0, MAX_SECTORS);
  if (top.length === 0) {
    return [{ name: null, color: hexToRgb(FALLBACK_COLOR), start: 0, span: TAU }];
  }
  const weights = rootWeights(top.map((language) => language.share));
  let start = 0;
  return top.map((language, i) => {
    const span = weights[i] * TAU;
    const sector = {
      name: language.name,
      color: hexToRgb(language.color, FALLBACK_COLOR),
      start,
      span,
    };
    start += span;
    return sector;
  });
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

/**
 * Data encodings:
 * - depth along the tunnel is time: the oldest day at one end, the newest at the other
 * - one dot per calendar day spirals along the wall; busier days sit closer to the axis
 * - the wall is striped by language (sector width = square root of its share of bytes)
 * - one bright node per repository, ordered by age along the tunnel, sized by stars
 *
 * It returns the same particle count and the same entities as the galaxy for the same input,
 * so a viewer can morph from one preset to the other.
 */
export function buildTunnel(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const sectors = buildSectors(metrics);
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

  const depth = (t: number): number => -LENGTH / 2 + LENGTH * t;

  const maxDay = calendar.reduce((max, day) => Math.max(max, day.count), 0);
  const ringColor = hexToRgb(RING_COLOR);
  calendar.forEach((day, i) => {
    const t = calendar.length > 1 ? i / (calendar.length - 1) : 0.5;
    const activity = logScale(day.count, maxDay, 10);
    const angle = i * GOLDEN_ANGLE;
    const radius = RADIUS - activity * 2.2;
    entities.push(dayEntity(index, day));
    put(
      state,
      index++,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      depth(t),
      scaleColor(ringColor, 0.25 + 0.75 * activity),
      0.5 + 1.6 * activity,
    );
  });

  const maxStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
  const languageColor = new Map(
    metrics.languages.map((l) => [l.name, hexToRgb(l.color, FALLBACK_COLOR)] as const),
  );
  repos.forEach((repo, i) => {
    const t = repos.length > 1 ? i / (repos.length - 1) : 0.5;
    const sector =
      sectors.find((s) => s.name !== null && s.name === repo.primaryLanguage) ??
      sectors[hashString(repo.name) % sectors.length];
    const angle = sector.start + sector.span * (0.2 + 0.6 * rng());
    const baseColor =
      (repo.primaryLanguage ? languageColor.get(repo.primaryLanguage) : undefined) ??
      hexToRgb(FALLBACK_COLOR);
    entities.push(repositoryEntity(index, repo));
    put(
      state,
      index++,
      Math.cos(angle) * (RADIUS + 0.9),
      Math.sin(angle) * (RADIUS + 0.9),
      depth(t),
      scaleColor(baseColor, repo.isFork ? 0.6 : 1),
      1.5 + 4.5 * logScale(repo.stars, maxStars, 20),
    );
  });

  for (let n = 0; n < dustCount; n++) {
    const angle = rng() * TAU;
    const sector = sectors.find((s) => angle < s.start + s.span) ?? sectors[sectors.length - 1];
    const radius = RADIUS + (rng() + rng() - 1) * 0.5;
    const z = (rng() - 0.5) * LENGTH;
    put(
      state,
      index++,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      z,
      scaleColor(sector.color, 0.35 + 0.35 * rng()),
      0.5 + 0.5 * rng(),
    );
  }

  if (options.startScattered) {
    scatterInBox(state, rng, LENGTH / 2);
  } else {
    state.position.set(state.target);
  }

  return {
    state,
    seed,
    entities,
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 1.2 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const tunnelPreset: Preset = {
  id: 'tunnel',
  name: 'Tunnel',
  legend:
    'Coloured stripes along the wall are languages · bright nodes are repositories, sized by stars · the spiral of dots is one per day, oldest at the far end, and spikes pointing inward mean busier days',
  caption:
    'Stripes: languages · Nodes: repositories, sized by stars · Spiral dots: one per day, inward = busier',
  view: { yaw: 0.5, pitch: 0.3, distance: 38, fov: Math.PI / 4 },
  build: buildTunnel,
};
