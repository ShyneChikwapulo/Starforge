export type Rgb = [number, number, number];

/**
 * Log-scale `value` to 0..1 against max(observedMax, reference).
 * The reference keeps small profiles modest: 1 star should not look as big as 1000.
 */
export function logScale(value: number, observedMax: number, reference: number): number {
  const top = Math.max(observedMax, reference);
  if (top <= 0) return 0;
  return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(top));
}

/** Parse "#rrggbb" into 0..1 channels, falling back when the input is missing or invalid. */
export function hexToRgb(hex: string | null | undefined, fallback = '#8b949e'): Rgb {
  const source = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
  return [
    parseInt(source.slice(1, 3), 16) / 255,
    parseInt(source.slice(3, 5), 16) / 255,
    parseInt(source.slice(5, 7), 16) / 255,
  ];
}

export function scaleColor(color: Rgb, factor: number): Rgb {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

/** FNV-1a 32-bit hash, for stable, seed-independent placement decisions. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Square-root compress values and normalise them to sum to 1, so small shares stay visible. */
export function rootWeights(values: number[]): number[] {
  if (values.length === 0) return [];
  const roots = values.map((v) => Math.sqrt(Math.max(0, v)));
  const total = roots.reduce((sum, r) => sum + r, 0);
  return total > 0 ? roots.map((r) => r / total) : values.map(() => 1 / values.length);
}
