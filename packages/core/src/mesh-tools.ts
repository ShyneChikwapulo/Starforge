import type { SolidMesh } from './mesh';

/**
 * The mesh moved by (x, y, z). Only positions are copied: the normals, colours and indices are
 * shared with the original, and are never modified.
 */
export function translateMesh(mesh: SolidMesh, x: number, y: number, z = 0): SolidMesh {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = mesh.positions[i]! + x;
    positions[i + 1] = mesh.positions[i + 1]! + y;
    positions[i + 2] = mesh.positions[i + 2]! + z;
  }
  return { positions, normals: mesh.normals, colors: mesh.colors, indices: mesh.indices };
}

/** Join meshes into one. Indices are shifted so every part keeps pointing at its own vertices. */
export function mergeMeshes(meshes: readonly SolidMesh[]): SolidMesh {
  let vertices = 0;
  let indexCount = 0;
  for (const mesh of meshes) {
    vertices += mesh.positions.length / 3;
    indexCount += mesh.indices.length;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, vertexOffset * 3);
    normals.set(mesh.normals, vertexOffset * 3);
    colors.set(mesh.colors, vertexOffset * 3);
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[indexOffset + i] = mesh.indices[i]! + vertexOffset;
    }
    vertexOffset += mesh.positions.length / 3;
    indexOffset += mesh.indices.length;
  }
  return { positions, normals, colors, indices };
}
