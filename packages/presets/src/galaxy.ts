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
import { hashString, hexToRgb, logScale, rootWeights, scaleColor, type Rgb } from './scale';
import type { Preset, PresetOptions, PresetResult } from './types';

const GALAXY_RADIUS = 10;
const CORE_RADIUS = 0.6;
const RING_RADIUS = GALAXY_RADIUS + 2;
const RING_HEIGHT = 2.5;
const TWIST = 3.2;
export const GALAXY_MAX_ARMS = 6;
const MAX_REPOS = 100;
const DEFAULT_PARTICLES = 6000;
const FALLBACK_COLOR = '#8b949e';
const RING_COLOR = '#ffd27a';

interface Arm {
  name: string | null;
  color: Rgb;
  /** Share of dust particles on this arm; weights sum to 1. */
  weight: number;
  angle: number;
}

function buildArms(metrics: Metrics): Arm[] {
  const top = metrics.languages.slice(0, GALAXY_MAX_ARMS);
  if (top.length === 0) {
    return [{ name: null, color: hexToRgb(FALLBACK_COLOR), weight: 1, angle: 0 }];
  }
  const weights = rootWeights(top.map((language) => language.share));
  return top.map((language, i) => ({
    name: language.name,
    color: hexToRgb(language.color, FALLBACK_COLOR),
    weight: weights[i],
    angle: (i / top.length) * Math.PI * 2,
  }));
}

function pickArm(arms: Arm[], u: number): Arm {
  let cumulative = 0;
  for (const arm of arms) {
    cumulative += arm.weight;
    if (u < cumulative) return arm;
  }
  return arms[arms.length - 1];
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
 * - one spiral arm per top language (colour = language colour, density = square root of share of bytes)
 * - one bright star per repository (size = stars, log-scaled; older repos nearer the core)
 * - one ring particle per calendar day (height and brightness = that day's activity)
 * - dust fills the arms
 */
export function buildGalaxy(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const arms = buildArms(metrics);
  const calendar = metrics.contributions.calendar;
  const repos = [...metrics.repositories]
    .sort((a, b) => b.stars - a.stars)
    .slice(0, MAX_REPOS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const requested = options.particleCount ?? DEFAULT_PARTICLES;
  const dustCount = Math.max(0, requested - calendar.length - repos.length);
  const state = createParticleState(calendar.length + repos.length + dustCount);
  let index = 0;

  // Activity ring: one particle per day.
  const maxDay = calendar.reduce((max, day) => Math.max(max, day.count), 0);
  const ringColor = hexToRgb(RING_COLOR);
  calendar.forEach((day, i) => {
    const activity = logScale(day.count, maxDay, 10);
    const angle = (i / calendar.length) * Math.PI * 2;
    put(
      state,
      index++,
      Math.cos(angle) * RING_RADIUS,
      activity * RING_HEIGHT,
      Math.sin(angle) * RING_RADIUS,
      scaleColor(ringColor, 0.25 + 0.75 * activity),
      0.5 + 1.6 * activity,
    );
  });

  // Repository stars, placed on their language's arm.
  const maxStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
  const languageColor = new Map(
    metrics.languages.map((l) => [l.name, hexToRgb(l.color, FALLBACK_COLOR)] as const),
  );
  repos.forEach((repo, i) => {
    const age = repos.length > 1 ? i / (repos.length - 1) : 0.5;
    const radius = CORE_RADIUS + (GALAXY_RADIUS - CORE_RADIUS) * (0.25 + 0.7 * age);
    const arm =
      arms.find((a) => a.name !== null && a.name === repo.primaryLanguage) ??
      arms[hashString(repo.name) % arms.length];
    const theta = arm.angle + TWIST * (radius / GALAXY_RADIUS) + (rng() - 0.5) * 0.2;
    const baseColor =
      (repo.primaryLanguage ? languageColor.get(repo.primaryLanguage) : undefined) ??
      hexToRgb(FALLBACK_COLOR);
    put(
      state,
      index++,
      Math.cos(theta) * radius,
      (rng() - 0.5) * 0.3,
      Math.sin(theta) * radius,
      scaleColor(baseColor, repo.isFork ? 0.6 : 1),
      1.5 + 4.5 * logScale(repo.stars, maxStars, 20),
    );
  });

  // Dust along the arms.
  for (let n = 0; n < dustCount; n++) {
    const arm = pickArm(arms, rng());
    const u = rng();
    const radius = CORE_RADIUS + (GALAXY_RADIUS - CORE_RADIUS) * u * u;
    const theta = arm.angle + TWIST * (radius / GALAXY_RADIUS) + (rng() + rng() - 1) * 0.35;
    const thickness = 0.4 * (1 - 0.7 * (radius / GALAXY_RADIUS));
    const y = (rng() + rng() - 1) * thickness;
    const brightness = 0.35 + 0.35 * rng();
    put(
      state,
      index++,
      Math.cos(theta) * radius,
      y,
      Math.sin(theta) * radius,
      scaleColor(arm.color, brightness),
      0.5 + 0.5 * rng(),
    );
  }

  if (options.startScattered) {
    scatterInBox(state, rng, GALAXY_RADIUS * 1.5);
  } else {
    state.position.set(state.target);
  }

  return {
    state,
    seed,
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 1.2 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const galaxyPreset: Preset = { id: 'galaxy', name: 'Galaxy', build: buildGalaxy };
