import { atomPreset } from './atom';
import { chessPreset } from './chess';
import { galaxyPreset } from './galaxy';
import { treePreset } from './tree';
import { tunnelPreset } from './tunnel';
import type { Preset } from './types';

export const PRESET_IDS = ['galaxy', 'tunnel', 'tree', 'atom', 'chess'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const presets: Record<PresetId, Preset> = {
  galaxy: galaxyPreset,
  tunnel: tunnelPreset,
  tree: treePreset,
  atom: atomPreset,
  chess: chessPreset,
};

/** Look a preset up by id, returning undefined for anything unknown. */
export function getPreset(id: string): Preset | undefined {
  return (PRESET_IDS as readonly string[]).includes(id) ? presets[id as PresetId] : undefined;
}
