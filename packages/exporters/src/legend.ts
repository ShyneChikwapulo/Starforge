import type { Metrics } from '@starforge/github-data';
import { GALAXY_MAX_ARMS } from '@starforge/presets';

export interface LegendOptions {
  /** Pixel width. Default 800, to sit under an 800px animation. */
  width?: number;
  /**
   * Background card as "#rrggbb", or null for none. Default: the galaxy renderer's navy on the
   * dark theme, and no card on the light theme.
   */
  background?: string | null;
  /** Text colours: light text for dark pages (default), or dark text for light pages. */
  theme?: 'dark' | 'light';
  /** One line explaining the encodings. Default describes the galaxy preset. */
  caption?: string;
}

const BASE_HEIGHT = 132;
const DEFAULT_CAPTION =
  'Arms: languages · Stars: repositories, sized by stars · Ring: one dot per day, taller = busier';
const ROW_HEIGHT = 24;
const CAPTION_LINE = 16;
const CHAR_WIDTH = 7.6;
const FALLBACK_COLOR = '#8b949e';
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

const PALETTES = {
  dark: { title: '#f0f6fc', text: '#c9d1d9', muted: '#8b949e', subtle: '#6e7681' },
  light: { title: '#1f2328', text: '#24292f', muted: '#57606a', subtle: '#6e7781' },
};

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

/** Split a caption into lines of at most `maxChars`, breaking only between " · " segments. */
export function wrapCaption(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const segment of text.split(' · ')) {
    const candidate = current ? `${current} · ${segment}` : segment;
    if (current && candidate.length > maxChars) {
      lines.push(current);
      current = segment;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * A caption strip that spells out what the galaxy encodes, using the same data as the picture.
 * Plain SVG text, so it stays crisp and works inside a README image tag. Language chips flow
 * left to right by estimated text width and wrap to a new row instead of overflowing.
 */
export function renderLegendSvg(metrics: Metrics, options: LegendOptions = {}): string {
  const width = options.width ?? 800;
  const theme = options.theme ?? 'dark';
  const palette = PALETTES[theme];
  const background =
    options.background === undefined ? (theme === 'dark' ? '#05080f' : null) : options.background;
  const caption = options.caption ?? DEFAULT_CAPTION;
  const login = metrics.user.login;

  const stats = [
    count(metrics.contributions.commits, 'commit', 'commits'),
    count(metrics.contributions.pullRequests, 'pull request', 'pull requests'),
    count(metrics.totals.repositories, 'repository', 'repositories'),
    count(metrics.totals.stars, 'star', 'stars'),
  ].join(' · ');

  const arms = metrics.languages.slice(0, GALAXY_MAX_ARMS);

  let chips: string;
  let rows = 1;
  if (arms.length === 0) {
    chips = `<text x="20" y="72" font-size="13" fill="${palette.muted}">No language data yet</text>`;
  } else {
    let x = 20;
    const parts: string[] = [];
    for (const language of arms) {
      const name = truncate(language.name, 11);
      const share = percent(language.share);
      const chipWidth = 18 + Math.ceil((name.length + 1 + share.length) * CHAR_WIDTH) + 20;
      if (x > 20 && x + chipWidth > width - 20) {
        x = 20;
        rows += 1;
      }
      const y = 68 + (rows - 1) * ROW_HEIGHT;
      const color =
        language.color && SAFE_COLOR.test(language.color) ? language.color : FALLBACK_COLOR;
      parts.push(
        `<circle cx="${x + 6}" cy="${y}" r="6" fill="${color}"/>` +
          `<text x="${x + 18}" y="${y + 4}" font-size="13">${escapeXml(name)} ` +
          `<tspan fill="${palette.muted}">${share}</tspan></text>`,
      );
      x += chipWidth;
    }
    chips = parts.join('');
  }

  const captionLines = wrapCaption(caption, Math.floor((width - 40) / 6.4));
  const height = BASE_HEIGHT + (rows - 1) * ROW_HEIGHT + (captionLines.length - 1) * CAPTION_LINE;
  const languageSummary = arms.map((l) => `${l.name} ${percent(l.share)}`).join(', ');
  const label = `Starforge legend for ${login}. ${stats}.${languageSummary ? ` Languages: ${languageSummary}.` : ''}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(label)}</title>`,
    ...(background
      ? [`<rect width="${width}" height="${height}" rx="8" fill="${background}"/>`]
      : []),
    `<g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${palette.text}">`,
    `<text x="20" y="32" font-size="18" font-weight="600" fill="${palette.title}">@${escapeXml(login)}</text>`,
    `<text x="${width - 20}" y="32" font-size="13" text-anchor="end" fill="${palette.muted}">${escapeXml(stats)}</text>`,
    `<text x="20" y="50" font-size="11" fill="${palette.subtle}">LAST 12 MONTHS · LANGUAGES BY SHARE OF CODE</text>`,
    chips,
    ...captionLines.map(
      (line, i) =>
        `<text x="20" y="${height - 16 - (captionLines.length - 1 - i) * CAPTION_LINE}" font-size="12" fill="${palette.muted}">${escapeXml(line)}</text>`,
    ),
    `</g>`,
    `</svg>`,
  ].join('\n');
}
