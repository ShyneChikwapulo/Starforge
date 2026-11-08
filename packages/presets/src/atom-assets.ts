import { KITTEN_QUANT, KITTEN_STARS, kittenData } from './atom-kitten-data';
import { ICON_COLORS, ICON_SIZE, languageIcons } from './language-icons-data';
import type { Rgb } from './scale';

export { ICON_SIZE };

/** The nucleus: points on a kitten, and links between some of them. */
export interface Kitten {
  /** x, y, z triples in a box 1 across, centred on the origin, y up, facing +z. Any prefix is an even subset. */
  points: Float32Array;
  /** The first `stars` points are the stars that links connect. */
  stars: number;
  /** Pairs of star indices. */
  links: Uint16Array;
}

/** A full-colour language logo: a palette and one palette index per pixel (0 is transparent). */
export interface LanguageIcon {
  palette: Rgb[];
  /** ICON_SIZE x ICON_SIZE indices, row by row, 0 to ICON_COLORS. */
  pixels: Uint8Array;
}

let kitten: Kitten | undefined;

/** The decoded kitten, built on first use and shared afterwards. Do not modify the arrays. */
export function getKitten(): Kitten {
  if (!kitten) {
    const binary = atob(kittenData.points);
    const points = new Float32Array(binary.length >> 1);
    for (let i = 0; i < points.length; i++) {
      const value = (binary.charCodeAt(i * 2 + 1) << 8) | binary.charCodeAt(i * 2);
      points[i] = (value >= 0x8000 ? value - 0x10000 : value) / KITTEN_QUANT;
    }
    const text = atob(kittenData.links);
    const links = new Uint16Array(text.length >> 1);
    for (let i = 0; i < links.length; i++) {
      links[i] = text.charCodeAt(i * 2) | (text.charCodeAt(i * 2 + 1) << 8);
    }
    kitten = { points, stars: KITTEN_STARS, links };
  }
  return kitten;
}

const icons = new Map<string, LanguageIcon>();

/** The logo for a GitHub language name, or undefined when there is none. */
export function getLanguageIcon(name: string): LanguageIcon | undefined {
  if (!Object.prototype.hasOwnProperty.call(languageIcons, name)) return undefined;
  let icon = icons.get(name);
  if (!icon) {
    const source = languageIcons[name]!;
    const colors = atob(source.palette);
    const palette: Rgb[] = [];
    for (let i = 0; i < ICON_COLORS; i++) {
      palette.push([
        colors.charCodeAt(i * 3) / 255,
        colors.charCodeAt(i * 3 + 1) / 255,
        colors.charCodeAt(i * 3 + 2) / 255,
      ]);
    }
    const bytes = atob(source.pixels);
    const pixels = new Uint8Array(ICON_SIZE * ICON_SIZE);
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes.charCodeAt(i);
      pixels[i * 2] = byte >> 4;
      pixels[i * 2 + 1] = byte & 15;
    }
    icon = { palette, pixels };
    icons.set(name, icon);
  }
  return icon;
}
