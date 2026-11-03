import { describe, expect, it } from 'vitest';
import type { GraphQLClient } from './client';
import { collectMetrics } from './collect';

const NOW = new Date('2026-01-10T12:00:00Z');

const USER_RESPONSE = {
  user: {
    login: 'octo',
    name: 'Octo Cat',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    createdAt: '2015-01-01T00:00:00Z',
    followers: { totalCount: 3 },
    following: { totalCount: 2 },
    contributionsCollection: {
      totalCommitContributions: 10,
      totalPullRequestContributions: 2,
      totalIssueContributions: 1,
      totalPullRequestReviewContributions: 4,
      contributionCalendar: {
        weeks: [
          {
            contributionDays: [
              { date: '2026-01-09', contributionCount: 0 },
              { date: '2026-01-08', contributionCount: 3 },
            ],
          },
          {
            contributionDays: [
              { date: '2025-01-01', contributionCount: 99 },
              { date: '2026-01-10', contributionCount: 7 },
            ],
          },
        ],
      },
    },
  },
};

function repo(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    url: `https://github.com/octo/${name}`,
    description: null,
    stargazerCount: 5,
    forkCount: 1,
    primaryLanguage: { name: 'TypeScript' },
    repositoryTopics: { nodes: [{ topic: { name: 'three' } }] },
    createdAt: '2024-01-01T00:00:00Z',
    pushedAt: '2025-12-01T00:00:00Z',
    isFork: false,
    isArchived: false,
    languages: {
      edges: [
        { size: 300, node: { name: 'TypeScript', color: '#3178c6' } },
        { size: 100, node: { name: 'CSS', color: '#563d7c' } },
      ],
    },
    ...extra,
  };
}

function reposPage(
  nodes: unknown[],
  hasNextPage: boolean,
  endCursor: string | null,
  total: number,
) {
  return {
    user: { repositories: { totalCount: total, pageInfo: { hasNextPage, endCursor }, nodes } },
  };
}

function fakeClient(pages: unknown[]) {
  const calls: string[] = [];
  let next = 0;
  const client: GraphQLClient = async (query) => {
    if (query.includes('StarforgeUser')) {
      calls.push('user');
      return USER_RESPONSE;
    }
    calls.push('repos');
    return pages[next++];
  };
  return { client, calls };
}

describe('collectMetrics', () => {
  it('maps GitHub responses into validated metrics', async () => {
    const { client } = fakeClient([
      reposPage([repo('a'), repo('b', { isFork: true, stargazerCount: 50 })], false, null, 2),
    ]);
    const m = await collectMetrics({ login: 'octo', client, now: NOW });

    expect(m.user.login).toBe('octo');
    expect(m.window).toEqual({ from: '2025-01-11', to: '2026-01-10' });
    expect(m.contributions.calendar).toEqual([
      { date: '2026-01-08', count: 3 },
      { date: '2026-01-09', count: 0 },
      { date: '2026-01-10', count: 7 },
    ]);
    expect(m.contributions.commits).toBe(10);

    // The fork is excluded from language stats but still listed as a repository.
    expect(m.languages[0]).toMatchObject({ name: 'TypeScript', bytes: 300, repoCount: 1 });
    expect(m.languages[0]!.share).toBeCloseTo(0.75);
    expect(m.repositories.map((r) => r.name)).toEqual(['b', 'a']);
    expect(m.repositories[1]!.topics).toEqual(['three']);
    expect(m.totals).toEqual({ repositories: 2, stars: 55, forks: 2 });
  });

  it('follows pagination until the last page', async () => {
    const { client, calls } = fakeClient([
      reposPage([repo('a'), repo('b')], true, 'cursor-1', 3),
      reposPage([repo('c')], false, null, 3),
    ]);
    const m = await collectMetrics({ login: 'octo', client, now: NOW });

    expect(m.repositories.map((r) => r.name).sort()).toEqual(['a', 'b', 'c']);
    expect(calls).toEqual(['user', 'repos', 'repos']);
  });

  it('throws when the user does not exist', async () => {
    const client: GraphQLClient = async () => ({ user: null });
    await expect(collectMetrics({ login: 'ghost', client, now: NOW })).rejects.toThrow(/not found/);
  });
});
