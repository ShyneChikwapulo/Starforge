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

/** Where a body is: a position plus a rotation about the vertical axis, in radians. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  spin: number;
}

/**
 * A solid mesh that moves. `pose` says where the body is after `turns` loops of the animation
 * (1 is one full loop; fractions are fine), so an animation loops seamlessly when every motion
 * completes whole turns per loop. The mesh is in local space, centred on its own origin.
 */
export interface SolidBody {
  mesh: SolidMesh;
  pose(turns: number): Pose;
  /** What a viewer shows when this body is hovered, for example a language and its share. */
  label?: { title: string; detail: string };
}
