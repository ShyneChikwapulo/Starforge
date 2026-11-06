import type { ContributionDay, Repository } from '@starforge/github-data';
import type { Entity } from './types';

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What a viewer shows when a calendar day is selected. */
export function dayEntity(particle: number, day: ContributionDay): Entity {
  return {
    particle,
    kind: 'day',
    title: day.date,
    detail: count(day.count, 'contribution', 'contributions'),
  };
}

/** What a viewer shows when a repository is selected. */
export function repositoryEntity(particle: number, repo: Repository): Entity {
  return {
    particle,
    kind: 'repository',
    title: repo.name,
    detail: [
      count(repo.stars, 'star', 'stars'),
      repo.primaryLanguage ?? 'no language',
      ...(repo.isFork ? ['fork'] : []),
      ...(repo.isArchived ? ['archived'] : []),
    ].join(' · '),
  };
}
