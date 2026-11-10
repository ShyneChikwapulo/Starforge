import { readFile } from 'node:fs/promises';
import { PRESET_IDS } from '@starforge/presets';
import { z } from 'zod';

export const ConfigSchema = z
  .strictObject({
    /** GitHub login to visualise. */
    username: z.string().min(1),
    preset: z.enum(PRESET_IDS).default('galaxy'),
    /** Where generated files are written, relative to the working directory. */
    outputDir: z.string().min(1).default('starforge'),
    format: z.enum(['webp', 'apng']).default('webp'),
    width: z.number().int().min(32).max(1600).optional(),
    height: z.number().int().min(32).max(1000).optional(),
    /** Frames in the loop. */
    frames: z.number().int().min(2).max(240).default(60),
    fps: z.number().min(1).max(60).default(15),
    /** Lossy WebP quality, 0 to 100. */
    quality: z.number().min(0).max(100).default(80),
    /** Glow strength; 0 turns bloom off. */
    bloom: z.number().min(0).max(3).default(0.9),
    seed: z.number().int().default(1),
    /** Also write a metrics.json snapshot next to the assets. */
    saveMetrics: z.boolean().default(true),
    /** Also write <preset>-legend.svg, a caption strip that spells out the data. */
    legend: z.boolean().default(true),
    /**
     * "dark" is the original look. "light" is drawn for white pages. "both" writes the dark set
     * and a second set named with "-light", so a README can pick one with a <picture> element.
     */
    theme: z.enum(['dark', 'light', 'both']).default('dark'),
    /**
     * The page colour the images are drawn on. "github" uses GitHub's default page colours,
     * #0d1117 for the dark set and #ffffff for the light set, which blends in on those themes and
     * keeps files small. "transparent" blends in on every theme but makes the files several times
     * larger. Or give a colour as "#rrggbb". Left out, a plain "dark" run keeps its original navy
     * and every other run uses "github".
     */
    background: z
      .union([z.literal('github'), z.literal('transparent'), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
      .optional(),
  })
  .refine(
    (config) =>
      config.theme !== 'both' ||
      config.background === undefined ||
      config.background === 'github' ||
      config.background === 'transparent',
    {
      message:
        'theme "both" paints two sets, so "background" must be "github", "transparent" or left out, not one colour',
      path: ['background'],
    },
  );

export type StarforgeConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(input: unknown): StarforgeConfig {
  return ConfigSchema.parse(input);
}

export async function loadConfig(path: string): Promise<StarforgeConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read config file: ${path}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Config file is not valid JSON: ${path}`);
  }
  return parseConfig(json);
}
