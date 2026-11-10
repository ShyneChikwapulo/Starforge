import { LIGHT_BLOOM_SCALE, LIGHT_INK, type Look } from '@starforge/exporters';
import type { StarforgeConfig } from './config';

export type ThemeName = 'dark' | 'light';

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
  const hex =
    config.background !== undefined && config.background !== 'transparent'
      ? config.background
      : null;
  // Only a plain dark run keeps the original navy. Every other run is transparent unless a colour is set.
  const navy = config.theme === 'dark' && config.background === undefined;
  const bloom = config.bloom > 0 ? { strength: config.bloom, levels: 4 } : null;

  return themes.map((theme): ResolvedLook => {
    const light = theme === 'light';
    return {
      theme,
      suffix: light ? '-light' : '',
      look: {
        background: hex !== null ? rgb(hex) : navy ? undefined : null,
        bloom: light && bloom ? { ...bloom, strength: bloom.strength * LIGHT_BLOOM_SCALE } : bloom,
        ink: light ? LIGHT_INK : undefined,
      },
      legendBackground: hex !== null ? hex : navy ? undefined : null,
    };
  });
}
