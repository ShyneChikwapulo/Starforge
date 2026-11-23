import type { Metrics } from '@starforge/github-data';
import { measureCardText, type DrawTextStyle } from './card-text';
import type { Skin } from './skin';

/**
 * The shared pieces of the info cards: plain, data-only cards (languages, a heatmap and so on)
 * that are drawn in a frame of their own and in any skin.
 */

export const INFO_CARD_IDS = ['languages', 'heatmap'] as const;
export type InfoCardId = (typeof INFO_CARD_IDS)[number];

export const PAD = 48;
export const CONTENT = 1104;

export type InfoTextStyle = Omit<DrawTextStyle, 'fill'> & { fill?: string };

export interface InfoCtx {
  metrics: Metrics;
  skin: Skin;
  colors: {
    accent: string;
    bg: string;
    panel: string;
    row: string;
    text: string;
    muted: string;
    soft: string;
    title: string;
    label: string;
  };
  text(x: number, y: number, content: string, style: InfoTextStyle): string;
  /** Outline attributes at `opacity`, in the skin's way. */
  edge(opacity: number): string;
  /** Fill attributes of an empty bar or cell at `opacity`, in the skin's way. */
  track(opacity: number): string;
}

export interface InfoCardDef {
  id: InfoCardId;
  title: string;
  /** The line under the title. */
  subtitle(metrics: Metrics): string;
  /** Up to three headline numbers, shown as chips. */
  chips(metrics: Metrics): string[];
  /** What the numbers mean and where they come from: plain sentences. */
  legend(metrics: Metrics): string;
  /** Draws the body from `top`: its parts, and the height it used. */
  body(ctx: InfoCtx, top: number): { parts: string[]; height: number };
}

/** Uppercase, and only the characters the baked font has. */
export const clean = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e\u00b7\u2014\u2026]/g, '')
    .toUpperCase();

export function wrap(text: string, size: number, spacing: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureCardText(next, size, spacing) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 0 B, 999 B, 1 KB, 1.2 KB, 15 KB, 2.5 MB: powers of a thousand, as GitHub counts. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${Number(value.toFixed(value >= 10 ? 0 : 1))} ${units[unit]}`;
}

/** "42%", or "<1%" for a share that rounds to nothing. */
export const percentText = (share: number): string =>
  share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
