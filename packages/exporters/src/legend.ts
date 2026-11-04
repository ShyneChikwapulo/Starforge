import type { Metrics } from '@starforge/github-data';
import { GALAXY_MAX_ARMS } from '@starforge/presets';

export interface LegendOptions {
  /** Pixel width. Default 800, to sit under an 800px animation. */
  width?: number;
  /** Background as "#rrggbb". Default matches the galaxy renderer's background. */
  background?: string;
}

const HEIGHT = 132;
const FALLBACK_COLOR = '#8b949e';
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const percent = (share: number): string => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

/**
 * A caption strip that spells out what the galaxy encodes, using the same data as the picture.
 * Plain SVG text, so it stays crisp and works inside a README image tag.
 */
export function renderLegendSvg(metrics: Metrics, options: LegendOptions = {}): string {
  const width = options.width ?? 800;
  const background = options.background ?? '#05080f';
  const login = metrics.user.login;

  const stats = [
    count(metrics.contributions.commits, 'commit', 'commits'),
    count(metrics.contributions.pullRequests, 'pull request', 'pull requests'),
    count(metrics.totals.repositories, 'repository', 'repositories'),
    count(metrics.totals.stars, 'star', 'stars'),
  ].join(' · ');

  const arms = metrics.languages.slice(0, GALAXY_MAX_ARMS);
  const chipWidth = (width - 40) / GALAXY_MAX_ARMS;

  const chips =
    arms.length === 0
      ? `<text x="20" y="72" font-size="13" fill="#8b949e">No language data yet</text>`
      : arms
          .map((language, i) => {
            const x = Math.round(20 + i * chipWidth);
            const color =
              language.color && SAFE_COLOR.test(language.color) ? language.color : FALLBACK_COLOR;
            return (
              `<circle cx="${x + 6}" cy="68" r="6" fill="${color}"/>` +
              `<text x="${x + 18}" y="72" font-size="13">${escapeXml(truncate(language.name, 11))} ` +
              `<tspan fill="#8b949e">${percent(language.share)}</tspan></text>`
            );
          })
          .join('');

  const languageSummary = arms.map((l) => `${l.name} ${percent(l.share)}`).join(', ');
  const label = `Starforge legend for ${login}. ${stats}.${languageSummary ? ` Languages: ${languageSummary}.` : ''}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    `<rect width="${width}" height="${HEIGHT}" rx="8" fill="${background}"/>`,
    `<g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" fill="#c9d1d9">`,
    `<text x="20" y="32" font-size="18" font-weight="600" fill="#f0f6fc">@${escapeXml(login)}</text>`,
    `<text x="${width - 20}" y="32" font-size="13" text-anchor="end" fill="#8b949e">${escapeXml(stats)}</text>`,
    `<text x="20" y="50" font-size="11" fill="#6e7681">LAST 12 MONTHS · LANGUAGES BY SHARE OF CODE</text>`,
    chips,
    `<text x="20" y="116" font-size="12" fill="#8b949e">Arms are languages · bright stars are repositories, sized by stars · the outer ring is one dot per day, taller means busier</text>`,
    `</g>`,
    `</svg>`,
  ].join('\n');
}
