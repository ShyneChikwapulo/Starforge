import type { SolidMesh } from '@starforge/core';
import { FIRST_GLYPH, FONT_CAP_HEIGHT, glyphData } from './text-font-data';

/**
 * Text as a solid mesh. Letters lie in the xy-plane with up as +y, and their front face (normal
 * -z) points at the default camera. That camera looks along +z and draws world -x towards the
 * right of the image, so the text reads along -x: align "left" puts x = 0 at the start of the
 * text and the rest of it at negative x. The mesh is centred on z = 0.
 *
 * Only printable ASCII is available. Any other character is drawn as a question mark and reported
 * in `missing`, so a caller can fall back to something that is plain ASCII, like a login.
 * There is no kerning: letters are spaced by their advance widths.
 */

interface Glyph {
  /** Distance to the next letter, in font units. */
  advance: number;
  /** x, y pairs in font units, y up: each outer shape followed by its holes. */
  points: Int16Array;
  /** Point count of each polygon, in order. */
  contours: Uint16Array;
  /** Three indices into the points per triangle, filling the face. */
  triangles: Uint16Array;
}

function decode(base64: string): DataView {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new DataView(bytes.buffer);
}

function int16s(base64: string): Int16Array {
  const view = decode(base64);
  const out = new Int16Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

function uint16s(base64: string): Uint16Array {
  const view = decode(base64);
  const out = new Uint16Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

let decoded: Glyph[] | undefined;

function glyphs(): Glyph[] {
  if (!decoded) {
    decoded = glyphData.map((entry) => ({
      advance: entry.advance,
      points: int16s(entry.points),
      contours: uint16s(entry.contours),
      triangles: uint16s(entry.triangles),
    }));
  }
  return decoded;
}

const FALLBACK = '?';

function lookup(char: string): { glyph: Glyph; supported: boolean } {
  const list = glyphs();
  const index = char.codePointAt(0)! - FIRST_GLYPH;
  if (index >= 0 && index < list.length) return { glyph: list[index]!, supported: true };
  return { glyph: list[FALLBACK.charCodeAt(0) - FIRST_GLYPH]!, supported: false };
}

export interface TextStyle {
  /** Height of a capital letter, in world units. */
  size: number;
  /** Extra space between letters, as a share of `size`. Default 0. */
  letterSpacing?: number;
}

export interface TextMetrics {
  /** Distance from the first letter's origin to the end of the last letter's advance. */
  width: number;
  /** Characters the font does not have, each listed once. */
  missing: string[];
}

/** How wide a piece of text will be, without building its mesh. */
export function measureText(text: string, style: TextStyle): TextMetrics {
  const scale = style.size / FONT_CAP_HEIGHT;
  const spacing = (style.letterSpacing ?? 0) * style.size;
  const missing: string[] = [];
  let width = 0;
  let count = 0;
  for (const char of text) {
    const { glyph, supported } = lookup(char);
    if (!supported && !missing.includes(char)) missing.push(char);
    width += glyph.advance * scale;
    count++;
  }
  if (count > 1) width += spacing * (count - 1);
  return { width, missing };
}

export interface TextMeshOptions extends TextStyle {
  /** Thickness of the letters along z, in world units. */
  depth: number;
  /** Colour of the letters, 0..1 per channel. */
  color: [number, number, number];
  /** Where x = 0 sits: at the start, the middle or the end of the text. Default "left". */
  align?: 'left' | 'center' | 'right';
  /** Where y = 0 sits: the baseline, or the vertical middle of a capital letter. Default "baseline". */
  anchor?: 'baseline' | 'middle';
  /** Angle in degrees above which an outline corner stays sharp. Default 40. */
  crease?: number;
}

export interface TextMesh {
  mesh: SolidMesh;
  /** The same width `measureText` reports. */
  width: number;
  missing: string[];
}

/** Extrude text into a solid mesh: a front face, a back face and walls around every outline. */
export function buildTextMesh(text: string, options: TextMeshOptions): TextMesh {
  const { size, depth } = options;
  const scale = size / FONT_CAP_HEIGHT;
  const spacing = (options.letterSpacing ?? 0) * size;
  const creaseCos = Math.cos(((options.crease ?? 40) * Math.PI) / 180);
  const { width, missing } = measureText(text, options);
  const shiftX = options.align === 'center' ? -width / 2 : options.align === 'right' ? -width : 0;
  const shiftY = options.anchor === 'middle' ? -size / 2 : 0;
  const zFront = -depth / 2;
  const zBack = depth / 2;
  const [red, green, blue] = options.color;

  // Lay the letters out and count what the mesh needs.
  const placed: { glyph: Glyph; x: number }[] = [];
  let pen = shiftX;
  let vertexCount = 0;
  let triangleCount = 0;
  for (const char of text) {
    const { glyph } = lookup(char);
    placed.push({ glyph, x: pen });
    const points = glyph.points.length / 2;
    // Two faces of `points` vertices, and four vertices for each wall edge.
    vertexCount += points * 6;
    triangleCount += (glyph.triangles.length / 3) * 2 + points * 2;
    pen += glyph.advance * scale + spacing;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  let v = 0;
  let t = 0;

  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    normals[v * 3] = nx;
    normals[v * 3 + 1] = ny;
    normals[v * 3 + 2] = nz;
    colors[v * 3] = red;
    colors[v * 3 + 1] = green;
    colors[v * 3 + 2] = blue;
    return v++;
  };
  const triangle = (a: number, b: number, c: number): void => {
    indices[t++] = a;
    indices[t++] = b;
    indices[t++] = c;
  };

  for (const { glyph, x } of placed) {
    const pts = glyph.points;
    const count = pts.length / 2;
    const px = (i: number): number => x + pts[i * 2]! * scale;
    const py = (i: number): number => shiftY + pts[i * 2 + 1]! * scale;

    // The two faces. The front one faces the camera (-z), the back one faces away.
    const front = v;
    for (let i = 0; i < count; i++) vertex(px(i), py(i), zFront, 0, 0, -1);
    const back = v;
    for (let i = 0; i < count; i++) vertex(px(i), py(i), zBack, 0, 0, 1);
    for (let k = 0; k < glyph.triangles.length; k += 3) {
      const a = glyph.triangles[k]!;
      const b = glyph.triangles[k + 1]!;
      const c = glyph.triangles[k + 2]!;
      const area = (px(b) - px(a)) * (py(c) - py(a)) - (py(b) - py(a)) * (px(c) - px(a));
      if (area < 0) {
        triangle(front + a, front + b, front + c);
        triangle(back + a, back + c, back + b);
      } else {
        triangle(front + a, front + c, front + b);
        triangle(back + a, back + b, back + c);
      }
    }

    // The walls. Polygons run so that material is on the left, which puts the outward normal of
    // every edge on its right-hand side.
    let start = 0;
    for (const length of glyph.contours) {
      const edgeX = new Float64Array(length);
      const edgeY = new Float64Array(length);
      for (let i = 0; i < length; i++) {
        const j = (i + 1) % length;
        const dx = pts[(start + j) * 2]! - pts[(start + i) * 2]!;
        const dy = pts[(start + j) * 2 + 1]! - pts[(start + i) * 2 + 1]!;
        const len = Math.hypot(dx, dy) || 1;
        edgeX[i] = dy / len;
        edgeY[i] = -dx / len;
      }
      // The normal at the corner where edge i - 1 meets edge i, or null where the corner is sharp.
      const smooth = (i: number): [number, number] | null => {
        const p = (i + length - 1) % length;
        if (edgeX[p]! * edgeX[i]! + edgeY[p]! * edgeY[i]! < creaseCos) return null;
        const sx = edgeX[p]! + edgeX[i]!;
        const sy = edgeY[p]! + edgeY[i]!;
        const len = Math.hypot(sx, sy) || 1;
        return [sx / len, sy / len];
      };

      for (let i = 0; i < length; i++) {
        const j = (i + 1) % length;
        const flat: [number, number] = [edgeX[i]!, edgeY[i]!];
        const n0 = smooth(i) ?? flat;
        const n1 = smooth(j) ?? flat;
        const a = start + i;
        const c = start + j;
        const v0 = vertex(px(a), py(a), zFront, n0[0], n0[1], 0);
        const v1 = vertex(px(c), py(c), zFront, n1[0], n1[1], 0);
        const v2 = vertex(px(c), py(c), zBack, n1[0], n1[1], 0);
        const v3 = vertex(px(a), py(a), zBack, n0[0], n0[1], 0);
        triangle(v0, v1, v2);
        triangle(v0, v2, v3);
      }
      start += length;
    }
  }

  // The renderer draws world -x towards the right of the image, so mirror the finished mesh to
  // make the text read left to right from the default camera. Flipping x also flips the winding.
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -positions[i]!;
    normals[i] = -normals[i]!;
  }
  for (let k = 0; k < indices.length; k += 3) {
    const second = indices[k + 1]!;
    indices[k + 1] = indices[k + 2]!;
    indices[k + 2] = second;
  }

  return { mesh: { positions, normals, colors, indices }, width, missing };
}
