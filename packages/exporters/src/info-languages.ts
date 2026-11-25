import { formatNumber, plural } from './hud';
import {
  CONTENT,
  PAD,
  clean,
  formatBytes,
  percentText,
  type InfoCardDef,
  type InfoCtx,
} from './info-kit';

const SHOWN = 10;

const shortName = (name: string): string => {
  const c = clean(name);
  return c.length > 22 ? `${c.slice(0, 21)}…` : c;
};

/** The languages of your code: a share bar across the card, then the biggest ten as rows. */
export const languagesCard: InfoCardDef = {
  id: 'languages',
  title: 'Languages',
  subtitle: (m) => `@${clean(m.user.login)} · PUBLIC REPOSITORIES`,
  chips: (m) => {
    if (m.languages.length === 0) return [];
    const total = m.languages.reduce((sum, l) => sum + l.bytes, 0);
    return [
      `${formatNumber(m.languages.length)} ${plural(m.languages.length, 'LANGUAGE', 'LANGUAGES')}`,
      `${formatBytes(total)} OF CODE`,
    ];
  },
  legend: (m) =>
    'Share of code, by size, in your public repositories that are not forks, as GitHub counts it. ' +
    'Archived repositories are included. ' +
    'Up to your 500 most starred repositories are read, and the 10 largest languages of each.' +
    (m.languages.length > SHOWN ? ` Showing the largest ${SHOWN} of ${m.languages.length}.` : ''),

  body(ctx: InfoCtx, top: number) {
    const { metrics, colors, skin, text } = ctx;
    const languages = metrics.languages;
    if (languages.length === 0) {
      return {
        parts: [
          text(PAD + CONTENT / 2, top + 70, 'NO LANGUAGE DATA', {
            size: 22,
            fill: colors.muted,
            spacing: 4,
            anchor: 'middle',
          }),
        ],
        height: 140,
      };
    }

    const shown = languages.slice(0, SHOWN);
    const rest = languages.slice(SHOWN);
    const restShare = rest.reduce((sum, l) => sum + l.share, 0);
    const parts: string[] = [];

    // The share bar, clipped to the skin's panel shape, with a thin gap between segments.
    const barH = 26;
    const outline = skin.shape(PAD, top, CONTENT, barH, { tl: 8, br: 8 });
    const segments: string[] = [];
    let x = PAD;
    const paint = (share: number, fill: string): void => {
      const w = share * CONTENT;
      if (w >= 0.5) {
        segments.push(
          `<rect x="${x.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${barH}" fill="${fill}" stroke="${colors.bg}" stroke-width="1.5"/>`,
        );
      }
      x += w;
    };
    for (const language of shown) paint(language.share, language.color ?? colors.accent);
    if (restShare > 0) paint(restShare, colors.muted);
    parts.push(
      `<clipPath id="langbar"><path d="${outline}"/></clipPath>`,
      `<g clip-path="url(#langbar)">${segments.join('')}</g>`,
      `<path d="${outline}" fill="none" ${ctx.edge(0.5)} stroke-width="1.4"/>`,
    );

    // The rows: two columns for more than five languages, one wide column otherwise.
    const twoColumns = shown.length > 5;
    const gutter = 56;
    const colW = twoColumns ? (CONTENT - gutter) / 2 : CONTENT;
    const perColumn = twoColumns ? Math.ceil(shown.length / 2) : shown.length;
    const rowH = 68;
    const startY = top + barH + 50;
    const peak = shown[0]!.share || 1;
    shown.forEach((language, i) => {
      const column = twoColumns ? Math.floor(i / perColumn) : 0;
      const row = twoColumns ? i % perColumn : i;
      const lx = PAD + column * (colW + gutter);
      const y = startY + row * rowH;
      const colour = language.color ?? colors.accent;
      const barW = colW - 32;
      parts.push(
        `<rect x="${lx}" y="${y - 17}" width="18" height="18" rx="5" fill="${colour}"/>`,
        text(lx + 32, y, shortName(language.name), { size: 22, spacing: 2 }),
        text(lx + colW, y, percentText(language.share), { size: 22, anchor: 'end' }),
        `<rect x="${lx + 32}" y="${y + 12}" width="${barW}" height="5" ${ctx.track(0.15)}/>`,
        `<rect x="${lx + 32}" y="${y + 12}" width="${Math.max(2, (barW * language.share) / peak).toFixed(1)}" height="5" fill="${colour}"/>`,
        text(
          lx + 32,
          y + 34,
          `${formatBytes(language.bytes)} · ${language.repoCount} ${plural(language.repoCount, 'REPO', 'REPOS')}`,
          { size: 13, fill: colors.muted, spacing: 2 },
        ),
      );
    });

    let height = barH + 50 + perColumn * rowH - 20;
    if (rest.length > 0) {
      parts.push(
        text(
          PAD,
          startY + perColumn * rowH + 6,
          `+${rest.length} MORE · ${percentText(restShare)}`,
          {
            size: 14,
            fill: colors.muted,
            spacing: 3,
          },
        ),
      );
      height += 34;
    }
    return { parts, height };
  },
};
