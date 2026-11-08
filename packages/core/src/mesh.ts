/**
 * Solid geometry that renderers draw as real triangles: depth-tested and lit, not as glowing
 * particles. Everything is in world units, the same space as particle positions.
 */
export interface SolidMesh {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Unit normals, same layout as positions. */
  normals: Float32Array;
  /** r, g, b per vertex, sRGB 0..1. This is the base colour; the renderer applies the lighting. */
  colors: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
}
