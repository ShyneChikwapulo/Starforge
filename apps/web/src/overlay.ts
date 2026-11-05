import type { Metrics } from '@starforge/github-data';
import { GALAXY_MAX_ARMS } from '@starforge/presets';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const percent = (share: number): string => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

/**
 * Fill the overlay with the data behind the picture. Everything goes in through textContent
 * and DOM calls, never HTML strings, because metrics.json comes from an arbitrary repository.
 */
export function renderOverlay(container: HTMLElement, metrics: Metrics, sourceLabel: string): void {
  const title = element('h1', `@${metrics.user.login}`);

  const stats = element(
    'p',
    [
      count(metrics.contributions.commits, 'commit', 'commits'),
      count(metrics.contributions.pullRequests, 'pull request', 'pull requests'),
      count(metrics.totals.repositories, 'repository', 'repositories'),
      count(metrics.totals.stars, 'star', 'stars'),
    ].join(' · '),
    'stats',
  );

  const languages = element('ul', undefined, 'languages');
  for (const language of metrics.languages.slice(0, GALAXY_MAX_ARMS)) {
    const item = element('li');
    const swatch = element('span', undefined, 'swatch');
    swatch.style.backgroundColor = language.color ?? '#8b949e';
    item.append(
      swatch,
      document.createTextNode(`${language.name} `),
      element('span', percent(language.share), 'share'),
    );
    languages.append(item);
  }

  const key = element(
    'p',
    'Arms are languages · bright stars are repositories, sized by stars · the outer ring is one dot per day, taller means busier',
  );
  const source = element('p', `Data: ${sourceLabel} · drag to orbit, scroll to zoom`);

  container.replaceChildren(title, stats, languages, key, source);
}
