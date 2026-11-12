import {
  createParticleState,
  createRng,
  drag,
  jitter,
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
import { hexToRgb, scaleColor, type Rgb } from './scale';
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
/** How the pieces rank, for how big a bead and how much sparkle each one gets. */
const LEVEL: Record<PieceKind, number> = { pawn: 1, knight: 2, rook: 3, queen: 4, king: 5 };
/** Share of the sparkle each piece gets: the tall ones glow most. */
const HALO_WEIGHT: Record<PieceKind, number> = {
  pawn: 0.15,
  knight: 0.5,
  rook: 1,
  queen: 2.5,
  king: 5,
};

const SLAB: Rgb = [0.04, 0.05, 0.07];
const TILE_A: Rgb = [0.085, 0.105, 0.135];
const TILE_B: Rgb = [0.06, 0.075, 0.1];
const QUIET_BEAD: Rgb = [0.18, 0.22, 0.28];

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

function put(
  state: ParticleState,
  index: number,
  x: number,
  y: number,
  z: number,
  color: Rgb,
  size: number,
): void {
  const i = index * 3;
  state.target[i] = x;
  state.target[i + 1] = y;
  state.target[i + 2] = z;
  state.color[i] = color[0];
  state.color[i + 1] = color[1];
  state.color[i + 2] = color[2];
  state.size[index] = size;
}

/**
 * Data encodings:
 * - one square per calendar day, a week to a column and a weekday to a row
 * - the piece on a square says how busy the day was: pawn, knight, rook, queen, king, and a bare
 *   square for a quiet day. Colour and height both grow with it
 * - one bead per day sits on its piece, and is returned as an entity so a viewer can explain it
 * - sparkle gathers around the tall pieces, and motes drift above the board (decoration only)
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
      put(state, index++, square.x, TILE_HEIGHT + 0.04, square.z, QUIET_BEAD, 0.45);
      return;
    }
    pieces.push({ kind, x: square.x, z: square.z });
    entities.push({ ...entity, detail: `${entity.detail} · ${NAMES[kind]}` });
    put(
      state,
      index++,
      square.x,
      TILE_HEIGHT + PIECE_SPECS[kind].height + 0.18,
      square.z,
      COLORS[kind],
      0.9 + 0.35 * LEVEL[kind],
    );
  });

  const totalWeight = pieces.reduce((sum, piece) => sum + HALO_WEIGHT[piece.kind], 0);
  const pickPiece = (u: number): PlacedPiece => {
    let cumulative = 0;
    for (const piece of pieces) {
      cumulative += HALO_WEIGHT[piece.kind] / totalWeight;
      if (u < cumulative) return piece;
    }
    return pieces[pieces.length - 1]!;
  };
  const haloCount = pieces.length > 0 ? Math.round(dustCount * 0.55) : 0;
  const halfWidth = Math.max(columns / 2 + 0.5, 1);

  for (let n = 0; n < dustCount; n++) {
    if (n < haloCount) {
      const piece = pickPiece(rng());
      const angle = rng() * Math.PI * 2;
      const radius = 0.14 + 0.4 * rng();
      const height = TILE_HEIGHT + (PIECE_SPECS[piece.kind].height + 0.5) * Math.sqrt(rng());
      put(
        state,
        index++,
        piece.x + Math.cos(angle) * radius,
        height,
        piece.z + Math.sin(angle) * radius,
        scaleColor(COLORS[piece.kind], 0.35 + 0.5 * rng()),
        0.4 + 0.7 * rng(),
      );
    } else {
      put(
        state,
        index++,
        (rng() * 2 - 1) * halfWidth,
        TILE_HEIGHT + rng() * rng() * 5,
        (rng() * 2 - 1) * (ROWS / 2 + 0.5),
        scaleColor([0.2, 0.9, 0.4], 0.12 + 0.2 * rng()),
        0.35 + 0.45 * rng(),
      );
    }
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
    behaviours: [
      spring({ stiffness: 6, damping: 4 }),
      jitter({ strength: 0.9 }),
      drag({ coefficient: 0.2 }),
    ],
  };
}

export const chessPreset: Preset = {
  id: 'chess',
  name: 'Chessboard',
  legend:
    'Each square is a day, a week to a column · the stronger the piece, the busier the day: pawn, knight, rook, queen, king · a bare square is a quiet day',
  caption:
    'Board: one square per day · Piece: pawn to king, taller and greener = busier · Empty square: no activity',
  view: { yaw: 0, pitch: 0.7, distance: 34, fov: Math.PI / 4 },
  sway: 0.28,
  size: { width: 800, height: 240 },
  build: buildChess,
};
