import {
  createParticleState,
  createRng,
  drag,
  scatterInBox,
  spring,
  type ParticleState,
  type SolidMesh,
} from '@starforge/core';
import type { ContributionDay, Metrics } from '@starforge/github-data';
import {
  PIECE_KINDS,
  PIECE_SPECS,
  addBox,
  addPiece,
  createMeshBuilder,
  toMesh,
  type PieceKind,
} from './chess-pieces';
import { dayEntity } from './entities';
import { hexToRgb, type Rgb } from './scale';
import type { Entity, Preset, PresetOptions, PresetResult } from './types';

const DEFAULT_PARTICLES = 16000;
/** One row per weekday, Sunday first, as on GitHub's own contribution graph. */
const ROWS = 7;
const TILE_HEIGHT = 0.06;
const DAY_MS = 86_400_000;

/** Piece colours from a quiet day to the busiest one: more contributions, a stronger green. */
export const PIECE_COLORS: Record<PieceKind, string> = {
  pawn: '#9fd9ad',
  knight: '#5fcf80',
  rook: '#2fdc63',
  queen: '#12e854',
  king: '#00ff5a',
};
const COLORS = Object.fromEntries(
  PIECE_KINDS.map((kind) => [kind, hexToRgb(PIECE_COLORS[kind])]),
) as Record<PieceKind, Rgb>;

const NAMES: Record<PieceKind, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
};

const SLAB: Rgb = [0.1, 0.13, 0.17];
const TILE_A: Rgb = [0.12, 0.15, 0.19];
const TILE_B: Rgb = [0.085, 0.105, 0.135];
/** Particles in this preset give off no light: the picture is only the lit board and pieces. */
const NO_LIGHT: Rgb = [0, 0, 0];

/**
 * The piece for each day. Days with no activity get none. The rest are ranked by quartile of the
 * profile's own non-zero days: pawn, knight, rook, queen. A day gets a king when it is the busiest
 * and strictly above the top quartile, so a profile where every active day is alike has no
 * queens or kings. A piece only appears where the data has room for it.
 */
export function classifyDays(counts: readonly number[]): (PieceKind | null)[] {
  const active = counts.filter((count) => count > 0).sort((a, b) => a - b);
  if (active.length === 0) return counts.map(() => null);
  const at = (share: number): number =>
    active[Math.min(active.length - 1, Math.ceil(share * active.length) - 1)]!;
  const q1 = at(0.25);
  const q2 = at(0.5);
  const q3 = at(0.75);
  const max = active[active.length - 1]!;
  return counts.map((count) => {
    if (count <= 0) return null;
    if (count > q3) return count === max ? 'king' : 'queen';
    if (count > q2) return 'rook';
    if (count > q1) return 'knight';
    return 'pawn';
  });
}

export interface Square {
  /** The week, counting from the oldest. */
  column: number;
  /** The weekday, 0 for Sunday. */
  row: number;
  /** World position of the square's centre. */
  x: number;
  z: number;
}

/**
 * Where each day stands. Weeks run from the left of the image to the right, which the renderer
 * draws towards -x, and Sunday is furthest from the camera, as at the top of GitHub's graph.
 */
export function layoutDays(calendar: readonly ContributionDay[]): {
  squares: Square[];
  columns: number;
} {
  if (calendar.length === 0) return { squares: [], columns: 0 };
  const times = calendar.map((day) => Date.parse(`${day.date}T00:00:00Z`));
  const start = Math.min(...times);
  const firstWeekday = new Date(start).getUTCDay();
  const placed = times.map((time) => ({
    column: Math.floor((Math.round((time - start) / DAY_MS) + firstWeekday) / 7),
    row: new Date(time).getUTCDay(),
  }));
  const columns = Math.max(...placed.map((square) => square.column)) + 1;
  return {
    columns,
    squares: placed.map(({ column, row }) => ({
      column,
      row,
      x: (columns - 1) / 2 - column,
      z: (ROWS - 1) / 2 - row,
    })),
  };
}

interface PlacedPiece {
  kind: PieceKind;
  x: number;
  z: number;
}

/** The board, its squares and every piece, as one solid mesh. */
function buildBoard(columns: number, pieces: readonly PlacedPiece[]): SolidMesh {
  const b = createMeshBuilder();
  addBox(b, [0, -0.15, 0], [columns + 1.2, 0.3, ROWS + 1.2], SLAB);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < ROWS; row++) {
      addBox(
        b,
        [(columns - 1) / 2 - column, TILE_HEIGHT / 2, (ROWS - 1) / 2 - row],
        [0.94, TILE_HEIGHT, 0.94],
        (column + row) % 2 === 0 ? TILE_A : TILE_B,
      );
    }
  }
  for (const piece of pieces) {
    addPiece(b, piece.kind, piece.x, piece.z, COLORS[piece.kind], TILE_HEIGHT);
  }
  return toMesh(b);
}

function put(state: ParticleState, index: number, x: number, y: number, z: number): void {
  const i = index * 3;
  state.target[i] = x;
  state.target[i + 1] = y;
  state.target[i + 2] = z;
  state.color[i] = NO_LIGHT[0];
  state.color[i + 1] = NO_LIGHT[1];
  state.color[i + 2] = NO_LIGHT[2];
  state.size[index] = 1;
}

/**
 * Data encodings:
 * - one square per calendar day, a week to a column and a weekday to a row
 * - the piece on a square says how busy the day was: pawn, knight, rook, queen, king, and a bare
 *   square for a quiet day. Colour and height both grow with it
 *
 * The picture is solid: the board and every piece are lit triangles. The particles give off no
 * light. There is one per day, above its piece, so a viewer can explain a day on hover (these are
 * the returned entities), and the rest only fill out the particle count so presets can morph into
 * one another.
 */
export function buildChess(metrics: Metrics, options: PresetOptions = {}): PresetResult {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const calendar = metrics.contributions.calendar;
  const { squares, columns } = layoutDays(calendar);
  const kinds = classifyDays(calendar.map((day) => day.count));

  const requested = options.particleCount ?? DEFAULT_PARTICLES;
  const dustCount = Math.max(0, requested - calendar.length);
  const state = createParticleState(calendar.length + dustCount);
  const entities: Entity[] = [];
  const pieces: PlacedPiece[] = [];
  let index = 0;

  calendar.forEach((day, i) => {
    const square = squares[i]!;
    const kind = kinds[i] ?? null;
    const entity = dayEntity(index, day);
    if (kind === null) {
      entities.push(entity);
      put(state, index++, square.x, TILE_HEIGHT + 0.04, square.z);
      return;
    }
    pieces.push({ kind, x: square.x, z: square.z });
    entities.push({ ...entity, detail: `${entity.detail} · ${NAMES[kind]}` });
    put(state, index++, square.x, TILE_HEIGHT + PIECE_SPECS[kind].height + 0.18, square.z);
  });

  // The filler sits inside the board, out of sight.
  const halfWidth = Math.max(columns / 2, 1);
  for (let n = 0; n < dustCount; n++) {
    put(state, index++, (rng() * 2 - 1) * halfWidth, -0.1, (rng() * 2 - 1) * (ROWS / 2));
  }

  if (options.startScattered) {
    scatterInBox(state, rng, Math.max(columns / 2 + 2, 10));
  } else {
    state.position.set(state.target);
  }

  return {
    state,
    seed,
    entities,
    mesh: buildBoard(columns, pieces),
    behaviours: [spring({ stiffness: 6, damping: 4 }), drag({ coefficient: 0.2 })],
  };
}

export const chessPreset: Preset = {
  id: 'chess',
  name: 'Chessboard',
  legend:
    'Each square is a day, a week to a column · the stronger the piece, the busier the day: pawn, knight, rook, queen, king · a bare square is a quiet day',
  caption:
    'Board: one square per day · Piece: pawn to king, taller and greener = busier · Empty square: no activity',
  view: { yaw: 0, pitch: 0.7, distance: 22.5, fov: Math.PI / 4 },
  sway: 0.15,
  size: { width: 960, height: 200 },
  build: buildChess,
};
