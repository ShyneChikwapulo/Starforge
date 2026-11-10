import { LIGHT_BLOOM_SCALE, LIGHT_INK, type Look } from '@starforge/exporters';
import type { StarforgeConfig } from './config';

export type ThemeName = 'dark' | 'light';

/** GitHub's default page colours, which `"background": "github"` paints each set on. */
export const GITHUB_PAGE: Record<ThemeName, string> = { dark: '#0d1117', light: '#ffffff' };

export interface ResolvedLook {
  theme: ThemeName;
  /** Added to the file names. Empty for the dark look, so existing names never change. */
  suffix: '' | '-light';
  look: Look;
  /** "#rrggbb" for a card behind the legend, null for none, undefined for the legend's own default. */
  legendBackground: string | null | undefined;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** Turn the theme and background settings into the looks to render, dark first. */
export function resolveLooks(config: StarforgeConfig): ResolvedLook[] {
  const themes: ThemeName[] = config.theme === 'both' ? ['dark', 'light'] : [config.theme];
  // A plain dark run keeps the original navy. Every other run uses GitHub's page colours unless told otherwise.
  const background = config.background ?? (config.theme === 'dark' ? 'navy' : 'github');
  const bloom = config.bloom > 0 ? { strength: config.bloom, levels: 4 } : null;
  // On GitHub's own colours the legend text sits directly on the page, with no card behind it.
  const legendBackground =
    background === 'navy'
      ? undefined
      : background === 'github' || background === 'transparent'
        ? null
        : background;

  return themes.map((theme): ResolvedLook => {
    const light = theme === 'light';
    const page = background === 'github' ? GITHUB_PAGE[theme] : background;
    return {
      theme,
      suffix: light ? '-light' : '',
      look: {
        background: page === 'navy' ? undefined : page === 'transparent' ? null : rgb(page),
        bloom: light && bloom ? { ...bloom, strength: bloom.strength * LIGHT_BLOOM_SCALE } : bloom,
        ink: light ? LIGHT_INK : undefined,
      },
      legendBackground,
    };
  });
}
