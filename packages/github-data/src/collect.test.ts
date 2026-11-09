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

const PR_STATS_RESPONSE = {
  opened: { issueCount: 20 },
  merged: { issueCount: 15 },
  user: { pullRequests: { totalCount: 90 } },
};

const COMMUNITY_RESPONSE = {
  user: {
    asSponsor: { totalCount: 2 },
    asMaintainer: { totalCount: 1 },
    repositoryDiscussions: { totalCount: 4 },
    repositoryDiscussionComments: { totalCount: 3 },
  },
};

const HIGHLIGHTS_RESPONSE = {
  user: {
    pinnedItems: {
      nodes: [
        {
          nameWithOwner: 'octo/a',
          url: 'https://github.com/octo/a',
          description: 'Pinned A',
          stargazerCount: 5,
          primaryLanguage: { name: 'TypeScript' },
        },
        // A non-repository pin arrives as an empty object and must be skipped.
        {},
      ],
    },
  },
  search: {
    issueCount: 7,
    nodes: [
      {
        repository: {
          nameWithOwner: 'small/tool',
          url: 'https://github.com/small/tool',
          stargazerCount: 10,
        },
      },
      {
        repository: {
          nameWithOwner: 'big/lib',
          url: 'https://github.com/big/lib',
          stargazerCount: 900,
        },
      },
      {
        repository: {
          nameWithOwner: 'big/lib',
          url: 'https://github.com/big/lib',
          stargazerCount: 900,
        },
      },
      null,
    ],
  },
};

const EXTRA_DEFAULTS: Record<string, unknown> = {
  StarforgePullRequestStats: PR_STATS_RESPONSE,
  StarforgeCommunity: COMMUNITY_RESPONSE,
  StarforgeHighlights: HIGHLIGHTS_RESPONSE,
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

/** `overrides` replaces an optional section's response; an Error makes that request fail. */
function fakeClient(pages: unknown[], overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const variables: Record<string, Record<string, unknown>> = {};
  let next = 0;
  const client: GraphQLClient = async (query, vars) => {
    if (query.includes('StarforgeUser')) {
      calls.push('user');
      return USER_RESPONSE;
    }
    const extra = Object.keys(EXTRA_DEFAULTS).find((name) => query.includes(name));
    if (extra) {
      calls.push(extra);
      variables[extra] = vars;
      const response = extra in overrides ? overrides[extra] : EXTRA_DEFAULTS[extra];
      if (response instanceof Error) throw response;
      return response;
    }
    calls.push('repos');
    return pages[next++];
  };
  return { client, calls, variables };
}

const onePage = () => [reposPage([repo('a')], false, null, 1)];

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
    expect(calls.filter((c) => c === 'user' || c === 'repos')).toEqual(['user', 'repos', 'repos']);
  });

  it('throws when the user does not exist', async () => {
    const client: GraphQLClient = async () => ({ user: null });
    await expect(collectMetrics({ login: 'ghost', client, now: NOW })).rejects.toThrow(/not found/);
  });

  it('collects pull request stats, community stats and highlights', async () => {
    const { client } = fakeClient(onePage());
    const m = await collectMetrics({ login: 'octo', client, now: NOW });

    expect(m.schemaVersion).toBe(2);
    expect(m.pullRequestStats).toEqual({ opened: 20, merged: 15, mergedAllTime: 90 });
    expect(m.community).toEqual({
      sponsoring: 2,
      sponsors: 1,
      discussionsStarted: 4,
      discussionsAnswered: 3,
    });
    expect(m.highlights!.pinned).toEqual([
      {
        nameWithOwner: 'octo/a',
        url: 'https://github.com/octo/a',
        description: 'Pinned A',
        stars: 5,
        primaryLanguage: 'TypeScript',
      },
    ]);
    // Grouped per repository, counted, and ordered by stars.
    expect(m.highlights!.notable).toEqual({
      mergedPullRequests: 7,
      repositories: [
        {
          nameWithOwner: 'big/lib',
          url: 'https://github.com/big/lib',
          stars: 900,
          mergedPullRequests: 2,
        },
        {
          nameWithOwner: 'small/tool',
          url: 'https://github.com/small/tool',
          stars: 10,
          mergedPullRequests: 1,
        },
      ],
    });
  });

  it('searches the same window as the calendar', async () => {
    const { client, variables } = fakeClient(onePage());
    await collectMetrics({ login: 'octo', client, now: NOW });

    expect(variables.StarforgePullRequestStats).toMatchObject({
      opened: 'author:octo is:pr created:2025-01-11..2026-01-10',
      merged: 'author:octo is:pr is:merged created:2025-01-11..2026-01-10',
    });
    expect(variables.StarforgeHighlights!.merged).toBe(
      'author:octo is:pr is:merged -user:octo sort:updated-desc',
    );
  });

  it('keeps going when one optional section fails', async () => {
    const warnings: string[] = [];
    const { client } = fakeClient(onePage(), { StarforgeCommunity: new Error('boom') });
    const m = await collectMetrics({
      login: 'octo',
      client,
      now: NOW,
      onWarning: (message) => warnings.push(message),
    });

    expect(m.community).toBeNull();
    expect(m.pullRequestStats).not.toBeNull();
    expect(m.highlights).not.toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/community stats.*boom/);
  });

  it('never puts an unsafe login into a search query', async () => {
    const warnings: string[] = [];
    const { client, calls } = fakeClient(onePage());
    const m = await collectMetrics({
      login: 'octo is:private',
      client,
      now: NOW,
      onWarning: (message) => warnings.push(message),
    });

    expect(m.pullRequestStats).toBeNull();
    expect(m.highlights).toBeNull();
    expect(m.community).not.toBeNull();
    expect(calls).not.toContain('StarforgePullRequestStats');
    expect(calls).not.toContain('StarforgeHighlights');
    expect(warnings).toHaveLength(2);
  });
});
