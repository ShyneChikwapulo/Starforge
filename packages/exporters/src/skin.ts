import { panel, type Cuts } from './hud';

/**
 * A skin is the look of a card: its palette, the shape of its panels, and how much decoration it
 * carries. Every card is drawn from a skin, so one layout can be dressed several ways.
 *
 * Colours are CSS colours. `shape` returns the outline of a rectangle, with its corners cut or
 * rounded; `cuts` are the nominal size of each corner in the cut-corner look, and a skin with a
 * different corner is free to ignore them. The other fields are data, not functions, so a skin made
 * by spreading another one still works: the helpers below read the skin's own colours.
 */
export interface SkinColors {
  /** The main colour: bars, dials, heatmaps and, in some skins, edges and chips. */
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
  /** Big titles, such as a name. Defaults to the accent. */
  title?: string;
  /** Small captions above a value. Defaults to the accent. */
  label?: string;
}

export const SKIN_NAMES = ['cyberpunk', 'default'] as const;
export type SkinName = (typeof SKIN_NAMES)[number];

export interface Skin {
  name: SkinName;
  colors: SkinColors;
  shape(x: number, y: number, w: number, h: number, cuts?: Cuts): string;
  /**
   * Outlines and dividers: "accent" tints them with the accent colour at a varying opacity (the
   * neon look); any other value is one flat colour.
   */
  lines: string;
  /** The empty part of a bar or a ring: "accent" at a low opacity, or one flat colour. */
  tracks: string;
  /** Chips: filled with the accent ("solid"), or the row colour with an outline ("outlined"). */
  chips: 'solid' | 'outlined';
  /**
   * Decoration: pulsing bars, corner wedges, chevron dividers, scanlines, grids and the dial's tick
   * ring. Off for a calm skin.
   */
  ornaments: boolean;
  /** A blur glow on titles, bars and dials, and a glow in the card's corners. */
  glow: boolean;
  /**
   * Whether the hero's name is set as a wordmark: the jagged display font, with larger initials
   * and a glitch layer. Without it the name is plain capitals in the card font.
   */
  wordmark: boolean;
}

/** The attributes of an outline or divider, at `opacity` in a skin that tints them. */
export function edgeAttrs(skin: Skin, opacity: number): string {
  return skin.lines === 'accent'
    ? `stroke="${skin.colors.accent}" stroke-opacity="${opacity}"`
    : `stroke="${skin.lines}"`;
}

/** The fill of the empty part of a bar, at `opacity` in a skin that tints it. */
export function trackAttrs(skin: Skin, opacity: number): string {
  return skin.tracks === 'accent'
    ? `fill="${skin.colors.accent}" fill-opacity="${opacity}"`
    : `fill="${skin.tracks}"`;
}

/** How to paint a chip: its fill, its text, and its outline if it has one. */
export function chipStyle(skin: Skin): { fill: string; text: string; stroke?: string } {
  if (skin.chips === 'solid') return { fill: skin.colors.accent, text: skin.colors.bg };
  return {
    fill: skin.colors.row,
    text: skin.colors.text,
    stroke: skin.lines === 'accent' ? skin.colors.accent : skin.lines,
  };
}

/** Yellow on black, chamfered panels, pulsing bars and glow: the original look, and the default. */
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
  lines: 'accent',
  tracks: 'accent',
  chips: 'solid',
  ornaments: true,
  glow: true,
  wordmark: true,
};

/** A rectangle with rounded corners: larger panels get larger radii. */
function rounded(x: number, y: number, w: number, h: number): string {
  const short = Math.min(w, h);
  const r = Math.min(short / 2, short > 120 ? 12 : short > 40 ? 8 : 6);
  return (
    `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} ` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
  );
}

/** GitHub's own dark palette: rounded corners, flat borders, no glow, no decoration. */
export function createDefaultSkin(accent = '#3fb950'): Skin {
  return {
    name: 'default',
    colors: {
      accent,
      accent2: '#58a6ff',
      bg: '#0d1117',
      panel: '#161b22',
      row: '#161b22',
      text: '#e6edf3',
      muted: '#7d8590',
      soft: '#c9d1d9',
      title: '#e6edf3',
      label: '#7d8590',
    },
    shape: rounded,
    lines: '#30363d',
    tracks: '#21262d',
    chips: 'outlined',
    ornaments: false,
    glow: false,
    wordmark: false,
  };
}

const SKINS: Record<SkinName, Skin> = {
  cyberpunk: CYBERPUNK,
  default: createDefaultSkin(),
};

/** The skin to draw with: a named one, one passed in whole, or the default. */
export function resolveSkin(skin?: SkinName | Skin): Skin {
  if (!skin) return CYBERPUNK;
  return typeof skin === 'string' ? SKINS[skin] : skin;
}

/** `#rgb` or `#rrggbb` as lowercase `#rrggbb`, or null when it is neither. */
export function normalizeHex(value: string): string | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
  if (!match) return null;
  const digits = match[1]!.toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
}

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The WCAG contrast ratio of two `#rrggbb` colours: 1 for the same colour, 21 for black on white. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** The least contrast an accent may have against the default skin's background. */
export const MIN_ACCENT_CONTRAST = 3;

/** Why `accent` cannot be used on the default skin, or null when it can. */
export function accentProblem(accent: string): string | null {
  const hex = normalizeHex(accent);
  if (!hex) return `skinAccent must be a colour such as "#ff2e88" or "#f28", got "${accent}"`;
  const background = createDefaultSkin().colors.bg;
  const ratio = contrastRatio(hex, background);
  if (ratio < MIN_ACCENT_CONTRAST) {
    return `skinAccent ${hex} is too dark to see on the default skin: its contrast against ${background} is ${ratio.toFixed(1)}:1 and it needs at least ${MIN_ACCENT_CONTRAST}:1`;
  }
  return null;
}
