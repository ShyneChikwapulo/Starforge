import { addDays } from './dates';
import type { ContributionDay, Metrics, PullRequestStats } from './schema';

export interface Streaks {
  /** Consecutive active days ending today, or ending yesterday if today has no activity yet. */
  current: number;
  /** The longest run of consecutive active days inside the calendar. */
  longest: number;
  longestStart: string | null;
  longestEnd: string | null;
}

/**
 * Streaks of days with at least one contribution.
 * A gap in the calendar data breaks a streak like an empty day does, and a tie keeps the earliest run.
 * `today` is the last day of the window, so an empty today does not reset a live streak.
 */
export function computeStreaks(calendar: readonly ContributionDay[], today: string): Streaks {
  const active = new Set(calendar.filter((day) => day.count > 0).map((day) => day.date));

  let longest = 0;
  let longestStart: string | null = null;
  let longestEnd: string | null = null;
  let run = 0;
  let runStart = '';
  let previous: string | null = null;
  for (const date of [...active].sort()) {
    if (previous !== null && addDays(previous, 1) === date) {
      run += 1;
    } else {
      run = 1;
      runStart = date;
    }
    if (run > longest) {
      longest = run;
      longestStart = runStart;
      longestEnd = date;
    }
    previous = date;
  }

  let cursor = active.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, longestStart, longestEnd };
}

/** Streaks for a whole metrics object, measured against the end of its window. */
export function getStreaks(metrics: Metrics): Streaks {
  return computeStreaks(metrics.contributions.calendar, metrics.window.to);
}

/** The share of opened pull requests that were merged, 0 to 1, or null when it is unknown or undefined. */
export function mergeRate(stats: PullRequestStats | null): number | null {
  if (!stats || stats.opened === 0) return null;
  return Math.min(1, stats.merged / stats.opened);
}
