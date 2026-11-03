import type { Metrics } from './schema';
import { addDays } from './dates';
import { SCHEMA_VERSION } from './schema';

export interface SampleOptions {
  /** Same seed always produces the same data. */
  seed?: number;
  /** Last day of the contribution window (YYYY-MM-DD). Fixed default keeps output deterministic. */
  to?: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], r: number): T {
  return items[Math.floor(r * items.length)] as T;
}

const LANGUAGES = [
  { name: 'TypeScript', color: '#3178c6' },
  { name: 'Python', color: '#3572A5' },
  { name: 'C#', color: '#178600' },
  { name: 'Rust', color: '#dea584' },
  { name: 'Go', color: '#00ADD8' },
] as const;

const REPO_NAMES = [
  'nebula',
  'vector',
  'lattice',
  'ember',
  'orbit',
  'prism',
  'quasar',
  'helix',
  'atlas',
  'forge',
  'signal',
  'comet',
] as const;

/**
 * Synthetic metrics for tests and local development of the engine.
 * Never use this as product output: real runs always come from the GitHub API.
 */
export function createSampleMetrics(options: SampleOptions = {}): Metrics {
  const rand = mulberry32(options.seed ?? 1);
  const to = options.to ?? '2026-01-01';
  const from = addDays(to, -364);

  const calendar = Array.from({ length: 365 }, (_, i) => {
    const date = addDays(from, i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const active = rand() < (weekend ? 0.25 : 0.7);
    const n = active ? Math.floor(rand() ** 2 * (weekend ? 6 : 14)) + 1 : 0;
    return { date, count: n };
  });
  const commits = calendar.reduce((sum, d) => sum + d.count, 0);

  const rawLanguages = LANGUAGES.map((l) => ({
    ...l,
    bytes: Math.floor(rand() * 900_000) + 50_000,
    repoCount: Math.floor(rand() * 8) + 1,
  }));
  const totalBytes = rawLanguages.reduce((sum, l) => sum + l.bytes, 0);
  const languages = rawLanguages
    .map((l) => ({ ...l, share: l.bytes / totalBytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const repositories = REPO_NAMES.map((name) => ({
    name,
    url: `https://github.com/sample-user/${name}`,
    description: null,
    stars: Math.floor(rand() ** 3 * 400),
    forks: Math.floor(rand() ** 3 * 60),
    primaryLanguage: pick(LANGUAGES, rand()).name,
    topics: [],
    createdAt: `${addDays(from, -Math.floor(rand() * 700))}T12:00:00Z`,
    pushedAt: `${addDays(to, -Math.floor(rand() * 300))}T12:00:00Z`,
    isFork: false,
    isArchived: false,
  })).sort((a, b) => b.stars - a.stars);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: `${to}T00:00:00Z`,
    visibility: 'public',
    user: {
      login: 'sample-user',
      name: 'Sample User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/0',
      createdAt: `${addDays(from, -1500)}T00:00:00Z`,
      followers: Math.floor(rand() * 200),
      following: Math.floor(rand() * 100),
    },
    window: { from, to },
    contributions: {
      commits,
      pullRequests: Math.round(commits * 0.12),
      issues: Math.round(commits * 0.04),
      reviews: Math.round(commits * 0.06),
      calendar,
    },
    languages,
    repositories,
    totals: {
      repositories: repositories.length,
      stars: repositories.reduce((sum, r) => sum + r.stars, 0),
      forks: repositories.reduce((sum, r) => sum + r.forks, 0),
    },
  };
}
