import { z } from 'zod';
import type { GraphQLClient } from './client';
import { addDays, isoDay } from './dates';
import {
  COMMUNITY_QUERY,
  HIGHLIGHTS_QUERY,
  PULL_REQUEST_STATS_QUERY,
  REPOS_QUERY,
  USER_QUERY,
} from './queries';
import type { Community, Highlights, Metrics, NotableRepository, PullRequestStats } from './schema';
import { SCHEMA_VERSION, parseMetrics } from './schema';

const totalCount = z.object({ totalCount: z.number() });

const RawUserResponse = z.object({
  user: z
    .object({
      login: z.string(),
      name: z.string().nullable(),
      avatarUrl: z.string(),
      createdAt: z.string(),
      followers: totalCount,
      following: totalCount,
      contributionsCollection: z.object({
        totalCommitContributions: z.number(),
        totalPullRequestContributions: z.number(),
        totalIssueContributions: z.number(),
        totalPullRequestReviewContributions: z.number(),
        contributionCalendar: z.object({
          weeks: z.array(
            z.object({
              contributionDays: z.array(
                z.object({ date: z.string(), contributionCount: z.number() }),
              ),
            }),
          ),
        }),
      }),
    })
    .nullable(),
});

const RawRepoSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  stargazerCount: z.number(),
  forkCount: z.number(),
  primaryLanguage: z.object({ name: z.string() }).nullable(),
  repositoryTopics: z.object({
    nodes: z.array(z.object({ topic: z.object({ name: z.string() }) }).nullable()).nullable(),
  }),
  createdAt: z.string(),
  pushedAt: z.string().nullable(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  languages: z.object({
    edges: z
      .array(
        z
          .object({
            size: z.number(),
            node: z.object({ name: z.string(), color: z.string().nullable() }),
          })
          .nullable(),
      )
      .nullable(),
  }),
});

const RawReposResponse = z.object({
  user: z
    .object({
      repositories: z.object({
        totalCount: z.number(),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(RawRepoSchema.nullable()),
      }),
    })
    .nullable(),
});

const RawPullRequestStatsResponse = z.object({
  opened: z.object({ issueCount: z.number() }),
  merged: z.object({ issueCount: z.number() }),
  user: z.object({ pullRequests: totalCount }).nullable(),
});

const RawCommunityResponse = z.object({
  user: z
    .object({
      asSponsor: totalCount,
      asMaintainer: totalCount,
      repositoryDiscussions: totalCount,
      repositoryDiscussionComments: totalCount,
    })
    .nullable(),
});

const RawHighlightsResponse = z.object({
  user: z
    .object({
      pinnedItems: z.object({
        // Non-repository nodes arrive as empty objects, so every field is optional here.
        nodes: z
          .array(
            z
              .object({
                nameWithOwner: z.string().optional(),
                url: z.string().optional(),
                description: z.string().nullable().optional(),
                stargazerCount: z.number().optional(),
                primaryLanguage: z.object({ name: z.string() }).nullable().optional(),
              })
              .nullable(),
          )
          .nullable(),
      }),
    })
    .nullable(),
  search: z.object({
    issueCount: z.number(),
    nodes: z
      .array(
        z
          .object({
            repository: z
              .object({
                nameWithOwner: z.string(),
                url: z.string(),
                stargazerCount: z.number(),
              })
              .optional(),
          })
          .nullable(),
      )
      .nullable(),
  }),
});

export type RawUser = NonNullable<z.infer<typeof RawUserResponse>['user']>;
export type RawRepo = z.infer<typeof RawRepoSchema>;

export interface BuildInput {
  user: RawUser;
  repos: RawRepo[];
  /** Total public owned repositories reported by the API. */
  repositoryCount: number;
  now: Date;
  /** Inclusive window, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Optional sections. Omitted or null means the data was not collected. */
  pullRequestStats?: PullRequestStats | null;
  community?: Community | null;
  highlights?: Highlights | null;
}

function validColor(color: string | null): string | null {
  return color !== null && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

/** Pure mapping from raw GitHub responses to validated Starforge metrics. */
export function buildMetrics(input: BuildInput): Metrics {
  const { user, repos, repositoryCount, now, from, to } = input;
  const collection = user.contributionsCollection;

  const byDate = new Map<string, number>();
  for (const week of collection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      if (day.date >= from && day.date <= to) byDate.set(day.date, day.contributionCount);
    }
  }
  const calendar = [...byDate]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const languageTotals = new Map<
    string,
    { color: string | null; bytes: number; repoCount: number }
  >();
  for (const repo of repos) {
    if (repo.isFork) continue;
    for (const edge of repo.languages.edges ?? []) {
      if (!edge) continue;
      const entry = languageTotals.get(edge.node.name) ?? {
        color: validColor(edge.node.color),
        bytes: 0,
        repoCount: 0,
      };
      entry.bytes += edge.size;
      entry.repoCount += 1;
      languageTotals.set(edge.node.name, entry);
    }
  }
  const totalBytes = [...languageTotals.values()].reduce((sum, l) => sum + l.bytes, 0);
  const languages = [...languageTotals]
    .filter(([, l]) => l.bytes > 0)
    .map(([name, l]) => ({
      name,
      color: l.color,
      bytes: l.bytes,
      repoCount: l.repoCount,
      share: l.bytes / totalBytes,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const repositories = repos
    .map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      stars: r.stargazerCount,
      forks: r.forkCount,
      primaryLanguage: r.primaryLanguage?.name ?? null,
      topics: (r.repositoryTopics.nodes ?? []).flatMap((n) => (n ? [n.topic.name] : [])),
      createdAt: r.createdAt,
      pushedAt: r.pushedAt,
      isFork: r.isFork,
      isArchived: r.isArchived,
    }))
    .sort((a, b) => b.stars - a.stars);

  return parseMetrics({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    visibility: 'public',
    user: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      followers: user.followers.totalCount,
      following: user.following.totalCount,
    },
    window: { from, to },
    contributions: {
      commits: collection.totalCommitContributions,
      pullRequests: collection.totalPullRequestContributions,
      issues: collection.totalIssueContributions,
      reviews: collection.totalPullRequestReviewContributions,
      calendar,
    },
    languages,
    repositories,
    totals: {
      repositories: repositoryCount,
      stars: repositories.reduce((sum, r) => sum + r.stars, 0),
      forks: repositories.reduce((sum, r) => sum + r.forks, 0),
    },
    pullRequestStats: input.pullRequestStats ?? null,
    community: input.community ?? null,
    highlights: input.highlights ?? null,
  });
}

function buildPullRequestStats(raw: z.infer<typeof RawPullRequestStatsResponse>): PullRequestStats {
  return {
    opened: raw.opened.issueCount,
    merged: raw.merged.issueCount,
    mergedAllTime: raw.user?.pullRequests.totalCount ?? 0,
  };
}

function buildCommunity(raw: z.infer<typeof RawCommunityResponse>): Community {
  const user = raw.user;
  return {
    sponsoring: user?.asSponsor.totalCount ?? 0,
    sponsors: user?.asMaintainer.totalCount ?? 0,
    discussionsStarted: user?.repositoryDiscussions.totalCount ?? 0,
    discussionsAnswered: user?.repositoryDiscussionComments.totalCount ?? 0,
  };
}

function buildHighlights(raw: z.infer<typeof RawHighlightsResponse>): Highlights {
  const pinned = (raw.user?.pinnedItems.nodes ?? []).flatMap((node) =>
    node && node.nameWithOwner !== undefined && node.url !== undefined
      ? [
          {
            nameWithOwner: node.nameWithOwner,
            url: node.url,
            description: node.description ?? null,
            stars: node.stargazerCount ?? 0,
            primaryLanguage: node.primaryLanguage?.name ?? null,
          },
        ]
      : [],
  );

  const byRepository = new Map<string, NotableRepository>();
  for (const node of raw.search.nodes ?? []) {
    const repository = node?.repository;
    if (!repository) continue;
    const entry = byRepository.get(repository.nameWithOwner);
    if (entry) {
      entry.mergedPullRequests += 1;
    } else {
      byRepository.set(repository.nameWithOwner, {
        nameWithOwner: repository.nameWithOwner,
        url: repository.url,
        stars: repository.stargazerCount,
        mergedPullRequests: 1,
      });
    }
  }
  const repositories = [...byRepository.values()]
    .sort((a, b) => b.stars - a.stars || a.nameWithOwner.localeCompare(b.nameWithOwner))
    .slice(0, 10);

  return { pinned, notable: { mergedPullRequests: raw.search.issueCount, repositories } };
}

/** Run one optional collection step. A failure becomes a warning and a null section, never a crash. */
async function optional<T>(
  label: string,
  warn: (message: string) => void,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    warn(`Skipped ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export interface CollectOptions {
  login: string;
  client: GraphQLClient;
  /** Injectable clock for tests. */
  now?: Date;
  /** Safety cap on repositories fetched (default 500). Star and fork totals cover fetched repos. */
  maxRepositories?: number;
  /** Receives a message when an optional section is skipped. Defaults to console.warn. */
  onWarning?: (message: string) => void;
}

/** Fetch a user's public GitHub data and return validated Starforge metrics. */
export async function collectMetrics(options: CollectOptions): Promise<Metrics> {
  const { login, client } = options;
  const now = options.now ?? new Date();
  const maxRepositories = options.maxRepositories ?? 500;
  const warn = options.onWarning ?? ((message: string) => console.warn(message));
  const to = isoDay(now);
  const from = addDays(to, -364);

  const userData = RawUserResponse.parse(
    await client(USER_QUERY, { login, from: `${from}T00:00:00Z`, to: now.toISOString() }),
  );
  if (!userData.user) throw new Error(`GitHub user not found: ${login}`);

  const repos: RawRepo[] = [];
  let repositoryCount = 0;
  let after: string | null = null;
  while (repos.length < maxRepositories) {
    const page: z.infer<typeof RawReposResponse> = RawReposResponse.parse(
      await client(REPOS_QUERY, { login, after }),
    );
    if (!page.user) throw new Error(`GitHub user not found: ${login}`);
    const connection = page.user.repositories;
    repositoryCount = connection.totalCount;
    repos.push(...connection.nodes.flatMap((n) => (n ? [n] : [])));
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  // The login ends up inside a search query, so only a plain GitHub login may be used there.
  const searchable = /^[A-Za-z0-9-]+$/.test(login);
  const requireSearchable = (): void => {
    if (!searchable) throw new Error(`"${login}" is not a plain GitHub login`);
  };

  const [pullRequestStats, community, highlights] = await Promise.all([
    optional('pull request stats', warn, async () => {
      requireSearchable();
      const raw = RawPullRequestStatsResponse.parse(
        await client(PULL_REQUEST_STATS_QUERY, {
          login,
          opened: `author:${login} is:pr created:${from}..${to}`,
          merged: `author:${login} is:pr is:merged created:${from}..${to}`,
        }),
      );
      return buildPullRequestStats(raw);
    }),
    optional('community stats', warn, async () =>
      buildCommunity(RawCommunityResponse.parse(await client(COMMUNITY_QUERY, { login }))),
    ),
    optional('highlights', warn, async () => {
      requireSearchable();
      const raw = RawHighlightsResponse.parse(
        await client(HIGHLIGHTS_QUERY, {
          login,
          merged: `author:${login} is:pr is:merged -user:${login} sort:updated-desc`,
        }),
      );
      return buildHighlights(raw);
    }),
  ]);

  return buildMetrics({
    user: userData.user,
    repos: repos.slice(0, maxRepositories),
    repositoryCount,
    now,
    from,
    to,
    pullRequestStats,
    community,
    highlights,
  });
}
