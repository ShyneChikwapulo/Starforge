import { z } from 'zod';

/** Bump when a change to the metrics shape is not backwards compatible. */
export const SCHEMA_VERSION = 1 as const;

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

export const MetricsSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
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
  })
  .refine((m) => m.window.from <= m.window.to, {
    message: 'window.from must not be after window.to',
    path: ['window'],
  })
  .refine(
    (m) =>
      m.languages.length === 0 ||
      Math.abs(m.languages.reduce((sum, l) => sum + l.share, 0) - 1) < 0.01,
    { message: 'language shares must sum to 1', path: ['languages'] },
  );

export type Language = z.infer<typeof LanguageSchema>;
export type Repository = z.infer<typeof RepositorySchema>;
export type ContributionDay = z.infer<typeof ContributionDaySchema>;
export type Metrics = z.infer<typeof MetricsSchema>;

/** Validate untrusted input and return typed metrics, or throw a ZodError. */
export function parseMetrics(input: unknown): Metrics {
  return MetricsSchema.parse(input);
}
