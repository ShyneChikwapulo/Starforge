import { z } from 'zod';

/**
 * The shape `collectMetrics` writes. Bump it when an existing field changes meaning or shape.
 * Version 2 added `pullRequestStats`, `community` and `highlights`; version 1 files are still
 * readable and are migrated by `parseMetrics`.
 */
export const SCHEMA_VERSION = 2 as const;

const isoDateTime = z.iso.datetime();
const isoDate = z.iso.date();
const count = z.number().int().nonnegative();

export const LanguageSchema = z.object({
  name: z.string().min(1),
  /** GitHub's language colour, e.g. "#3178c6", when known. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  bytes: count,
  repoCount: count,
  /** Fraction of total language bytes, 0 to 1. */
  share: z.number().min(0).max(1),
});

export const RepositorySchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  description: z.string().nullable(),
  stars: count,
  forks: count,
  primaryLanguage: z.string().nullable(),
  topics: z.array(z.string()),
  createdAt: isoDateTime,
  pushedAt: isoDateTime.nullable(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
});

export const ContributionDaySchema = z.object({
  date: isoDate,
  count,
});

export const UserSchema = z.object({
  login: z.string().min(1),
  name: z.string().nullable(),
  avatarUrl: z.url(),
  createdAt: isoDateTime,
  followers: count,
  following: count,
});

/** Pull request activity. The first two numbers cover the same window as the calendar. */
export const PullRequestStatsSchema = z.object({
  /** Pull requests the user opened during the window. */
  opened: count,
  /** Of those, how many have been merged, so merged / opened is the merge rate. */
  merged: count,
  /** Every pull request the user has ever had merged, in any window. */
  mergedAllTime: count,
});

/** Public sponsorship and discussion activity. */
export const CommunitySchema = z.object({
  /** Accounts the user sponsors publicly. */
  sponsoring: count,
  /** Accounts that sponsor the user publicly. */
  sponsors: count,
  discussionsStarted: count,
  /** Discussion comments by the user that were marked as the answer. */
  discussionsAnswered: count,
});

export const PinnedRepositorySchema = z.object({
  nameWithOwner: z.string().min(1),
  url: z.url(),
  description: z.string().nullable(),
  stars: count,
  primaryLanguage: z.string().nullable(),
});

export const NotableRepositorySchema = z.object({
  nameWithOwner: z.string().min(1),
  url: z.url(),
  stars: count,
  /** Merged pull requests by the user in this repository, within the sampled 100. */
  mergedPullRequests: count,
});

export const HighlightsSchema = z.object({
  /** The repositories pinned to the profile, at most six, in profile order. */
  pinned: z.array(PinnedRepositorySchema),
  notable: z.object({
    /** All merged pull requests the user has had accepted into repositories they do not own. */
    mergedPullRequests: count,
    /** Up to ten repositories, most stars first, from the 100 most recently updated such pull requests. */
    repositories: z.array(NotableRepositorySchema),
  }),
});

/** Everything both schema versions share. */
const coreShape = {
  generatedAt: isoDateTime,
  /** Only public data for now. Private contributions are a later, opt-in feature. */
  visibility: z.literal('public'),
  user: UserSchema,
  /** Inclusive date range covered by the contribution calendar. */
  window: z.object({ from: isoDate, to: isoDate }),
  contributions: z.object({
    commits: count,
    pullRequests: count,
    issues: count,
    reviews: count,
    calendar: z.array(ContributionDaySchema),
  }),
  languages: z.array(LanguageSchema),
  repositories: z.array(RepositorySchema),
  totals: z.object({ repositories: count, stars: count, forks: count }),
};

const windowIsOrdered = (m: { window: { from: string; to: string } }): boolean =>
  m.window.from <= m.window.to;

const sharesSumToOne = (m: { languages: { share: number }[] }): boolean =>
  m.languages.length === 0 || Math.abs(m.languages.reduce((sum, l) => sum + l.share, 0) - 1) < 0.01;

export const MetricsSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    ...coreShape,
    /** Null when the data could not be collected, or when migrated from a v1 snapshot. */
    pullRequestStats: PullRequestStatsSchema.nullable(),
    community: CommunitySchema.nullable(),
    highlights: HighlightsSchema.nullable(),
  })
  .refine(windowIsOrdered, {
    message: 'window.from must not be after window.to',
    path: ['window'],
  })
  .refine(sharesSumToOne, { message: 'language shares must sum to 1', path: ['languages'] });

/** The version 1 shape, kept only so snapshots written by earlier releases still load. */
const MetricsV1Schema = z
  .object({ schemaVersion: z.literal(1), ...coreShape })
  .refine(windowIsOrdered, {
    message: 'window.from must not be after window.to',
    path: ['window'],
  })
  .refine(sharesSumToOne, { message: 'language shares must sum to 1', path: ['languages'] });

export type Language = z.infer<typeof LanguageSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type ContributionDay = z.infer<typeof ContributionDaySchema>;
export type PullRequestStats = z.infer<typeof PullRequestStatsSchema>;
export type Community = z.infer<typeof CommunitySchema>;
export type PinnedRepository = z.infer<typeof PinnedRepositorySchema>;
export type NotableRepository = z.infer<typeof NotableRepositorySchema>;
export type Highlights = z.infer<typeof HighlightsSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;

function migrateV1(old: z.infer<typeof MetricsV1Schema>): Metrics {
  return {
    ...old,
    schemaVersion: SCHEMA_VERSION,
    pullRequestStats: null,
    community: null,
    highlights: null,
  };
}

/**
 * Validate untrusted input and return typed metrics, or throw a ZodError.
 * Version 1 snapshots are accepted and migrated; any other version is rejected.
 */
export function parseMetrics(input: unknown): Metrics {
  if (
    typeof input === 'object' &&
    input !== null &&
    (input as { schemaVersion?: unknown }).schemaVersion === 1
  ) {
    return migrateV1(MetricsV1Schema.parse(input));
  }
  return MetricsSchema.parse(input);
}
