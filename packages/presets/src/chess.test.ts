import { createSampleMetrics, type Metrics } from '@starforge/github-data';
import { describe, expect, it } from 'vitest';
import { PIECE_SPECS } from './chess-pieces';
import { buildChess, chessPreset, classifyDays, layoutDays } from './chess';

const sample = createSampleMetrics();
const calendar = sample.contributions.calendar;

const withCounts = (counts: (index: number) => number): Metrics => ({
  ...sample,
  contributions: {
    ...sample.contributions,
    calendar: calendar.map((day, i) => ({ ...day, count: counts(i) })),
  },
});

describe('classifyDays', () => {
  it('gives quiet days no piece', () => {
    expect(classifyDays([0, 0])).toEqual([null, null]);
  });

  it('ranks active days by quartile, with one king on the busiest', () => {
    expect(classifyDays([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      'pawn',
      'pawn',
      'knight',
      'knight',
      'rook',
      'rook',
      'queen',
      'king',
    ]);
  });

  it('gives every tied busiest day a king', () => {
    expect(classifyDays([1, 2, 3, 4, 5, 6, 9, 9]).slice(6)).toEqual(['king', 'king']);
  });

  it('invents no queens or kings when every active day is alike', () => {
    expect(classifyDays([3, 0, 3, 3])).toEqual(['pawn', null, 'pawn', 'pawn']);
  });

  it('handles no days at all', () => {
    expect(classifyDays([])).toEqual([]);
  });
});

describe('layoutDays', () => {
  it('has nothing to lay out for an empty calendar', () => {
    expect(layoutDays([])).toEqual({ squares: [], columns: 0 });
  });

  it('puts each day on its weekday row, with Sunday furthest from the camera', () => {
    const { squares } = layoutDays(calendar);
    calendar.forEach((day, i) => {
      const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      expect(squares[i]!.row).toBe(weekday);
      expect(squares[i]!.z).toBe(3 - weekday);
    });
  });

  it('runs the weeks from the left of the image, which is +x, to the right', () => {
    const { squares } = layoutDays(calendar);
    expect(squares[0]!.x).toBeGreaterThan(squares[squares.length - 1]!.x);
    for (let i = 1; i < squares.length; i++) {
      expect(squares[i]!.column).toBeGreaterThanOrEqual(squares[i - 1]!.column);
    }
  });

  it('fits a year in 52 or 53 weeks and never puts two days on one square', () => {
    const { squares, columns } = layoutDays(calendar);
    expect(columns).toBeGreaterThanOrEqual(52);
    expect(columns).toBeLessThanOrEqual(53);
    expect(new Set(squares.map((s) => `${s.column},${s.row}`)).size).toBe(squares.length);
  });
});

describe('buildChess', () => {
  it('builds the requested particle count', () => {
    expect(buildChess(sample, { particleCount: 1500 }).state.count).toBe(1500);
  });

  it('describes every calendar day once', () => {
    const { entities, state } = buildChess(sample, { particleCount: 1500 });
    expect(entities).toHaveLength(calendar.length);
    expect(new Set(entities.map((e) => e.particle)).size).toBe(entities.length);
    for (const entity of entities) {
      expect(entity.kind).toBe('day');
      expect(entity.particle).toBeLessThan(state.count);
    }
  });

  it('puts each day on its square, with a bead above its piece when it has one', () => {
    const { state, entities } = buildChess(sample, { particleCount: 1500 });
    const { squares } = layoutDays(calendar);
    const kinds = classifyDays(calendar.map((d) => d.count));
    entities.forEach((entity, i) => {
      const at = entity.particle * 3;
      expect(state.target[at]).toBeCloseTo(squares[i]!.x, 4);
      expect(state.target[at + 2]).toBeCloseTo(squares[i]!.z, 4);
      const kind = kinds[i];
      if (kind) expect(state.target[at + 1]).toBeGreaterThan(PIECE_SPECS[kind].height);
      else expect(state.target[at + 1]).toBeLessThan(0.2);
    });
  });

  it('names the piece in the detail of an active day, and makes busier days taller', () => {
    const { state, entities } = buildChess(sample, { particleCount: 1500 });
    const counts = calendar.map((d) => d.count);
    const busiest = counts.indexOf(Math.max(...counts));
    expect(entities[busiest]!.detail).toContain('King');
    const quietest = counts.findIndex(
      (c) => c > 0 && c === Math.min(...counts.filter((n) => n > 0)),
    );
    expect(state.target[entities[busiest]!.particle * 3 + 1]!).toBeGreaterThan(
      state.target[entities[quietest]!.particle * 3 + 1]!,
    );
  });

  it('returns the board and pieces as one solid mesh that fits the board', () => {
    const { mesh } = buildChess(sample, { particleCount: 1500 });
    const { columns } = layoutDays(calendar);
    expect(mesh).toBeDefined();
    expect(mesh!.indices.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh!.positions.length; i += 3) {
      expect(Math.abs(mesh!.positions[i]!)).toBeLessThanOrEqual(columns / 2 + 0.7);
      expect(mesh!.positions[i + 1]!).toBeGreaterThanOrEqual(-0.31);
      expect(mesh!.positions[i + 1]!).toBeLessThanOrEqual(2.5);
      expect(Math.abs(mesh!.positions[i + 2]!)).toBeLessThanOrEqual(4.2);
    }
  });

  it('is deterministic for a seed', () => {
    const a = buildChess(sample, { particleCount: 1500, seed: 5 });
    const b = buildChess(sample, { particleCount: 1500, seed: 5 });
    expect(a.state.target).toEqual(b.state.target);
    expect(a.mesh!.positions).toEqual(b.mesh!.positions);
  });

  it('keeps every value finite and colours within 0..1', () => {
    const { state } = buildChess(sample, { particleCount: 1500 });
    expect(state.target.every(Number.isFinite)).toBe(true);
    expect(state.color.every((c) => c >= 0 && c <= 1)).toBe(true);
    expect(state.size.every((s) => s > 0)).toBe(true);
  });

  it('builds a bare board when nothing happened', () => {
    const result = buildChess(
      withCounts(() => 0),
      { particleCount: 1500 },
    );
    expect(result.entities).toHaveLength(calendar.length);
    expect(result.state.count).toBe(1500);
    expect(result.mesh!.indices.length).toBeGreaterThan(0);
    for (const entity of result.entities) {
      expect(result.state.target[entity.particle * 3 + 1]!).toBeLessThan(0.2);
    }
  });

  it('copes with an empty calendar', () => {
    const empty: Metrics = {
      ...sample,
      contributions: { ...sample.contributions, calendar: [] },
    };
    const result = buildChess(empty, { particleCount: 500 });
    expect(result.entities).toEqual([]);
    expect(result.state.count).toBe(500);
    expect(result.state.target.every(Number.isFinite)).toBe(true);
  });

  it('starts scattered on request', () => {
    const { state } = buildChess(sample, { particleCount: 500, startScattered: true });
    let moved = 0;
    for (let i = 0; i < state.position.length; i++) {
      if (state.position[i] !== state.target[i]) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });
});

describe('chessPreset', () => {
  it('sways its camera and starts square-on to the board', () => {
    expect(chessPreset.sway).toBeGreaterThan(0);
    expect(chessPreset.view.yaw).toBe(0);
  });
});

describe('a solid chessboard', () => {
  it('gives its particles no light, so only the board and pieces are drawn', () => {
    const { state } = buildChess(sample, { particleCount: 1500 });
    expect(state.color.every((channel) => channel === 0)).toBe(true);
  });

  it('keeps the filler particles inside the board, out of sight', () => {
    const { state, entities } = buildChess(sample, { particleCount: 1500 });
    const { columns } = layoutDays(calendar);
    for (let i = entities.length; i < state.count; i++) {
      expect(Math.abs(state.target[i * 3]!)).toBeLessThanOrEqual(columns / 2);
      expect(state.target[i * 3 + 1]!).toBeLessThan(0);
    }
  });
});
