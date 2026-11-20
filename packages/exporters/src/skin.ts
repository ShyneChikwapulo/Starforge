import { panel, type Cuts } from './hud';

/**
 * A skin is the look of a card: its palette and the shape of its panels. Every card is drawn from
 * a skin, so one layout can be dressed several ways. Colours are CSS colours; `shape` returns the
 * outline of a rectangle, with its corners cut or rounded by `cuts` (each the nominal size of that
 * corner).
 */
export interface SkinColors {
  /** The main colour: titles, chips, bars and edges. */
  accent: string;
  /** A second colour, for a secondary layer such as the glitch behind the hero name. */
  accent2: string;
  bg: string;
  panel: string;
  row: string;
  /** Primary text. */
  text: string;
  muted: string;
  /** Secondary text, between `text` and `muted`. */
  soft: string;
}

export const SKIN_NAMES = ['cyberpunk'] as const;
export type SkinName = (typeof SKIN_NAMES)[number];

export interface Skin {
  name: SkinName;
  colors: SkinColors;
  shape(x: number, y: number, w: number, h: number, cuts?: Cuts): string;
}

/** Yellow on black, chamfered panels: the original look, and the default. */
export const CYBERPUNK: Skin = {
  name: 'cyberpunk',
  colors: {
    accent: '#fcee09',
    accent2: '#2ee6ff',
    bg: '#0a0a08',
    panel: '#13130d',
    row: '#1a1a12',
    text: '#f4f4ee',
    muted: '#a8a56a',
    soft: '#d6d4b4',
  },
  shape: panel,
};

const SKINS: Record<SkinName, Skin> = { cyberpunk: CYBERPUNK };

/** The skin to draw with: a named one, one passed in whole, or the default. */
export function resolveSkin(skin?: SkinName | Skin): Skin {
  if (!skin) return CYBERPUNK;
  return typeof skin === 'string' ? SKINS[skin] : skin;
}
