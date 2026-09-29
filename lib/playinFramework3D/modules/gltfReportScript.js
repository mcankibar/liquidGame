/**
 * to optimize glb files, run at gltf.report website
 */

import {
  dedup,
  flatten,
  instance,
  join,
  palette,
  prune,
  resample,
  simplify,
  sparse,
  textureCompress,
  vertexColorSpace,
  weld
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

/**
 * Example optimization pipeline implemented with the glTF Transform API.
 * Some optimizations, including KTX2 compression, require Node.js or CLI
 * environments. See https://gltf-transform.dev/ for full functionality.
 */

await document.transform(
  // Remove duplicate meshes, materials, textures, etc.
  dedup(),

  // Create GPU instancing batches for meshes used 5+ times.
  instance({ min: 5 }),

  // Create palette textures for compatible groups of 5+ materials.
  palette({ min: 5 }),

  // Reduce nesting of the scene graph; required for join().
  //flatten(),

  // Join compatible meshes.
  //join(),

  // Weld (index) all mesh geometry, removing duplicate vertices.
  weld(),

  // Simplify mesh geometry with meshoptimizer.
  simplify({
    simplifier: MeshoptSimplifier,
    error: 1,
    ratio: 0.5,
    lockBorder: true
  }),

  // Losslessly resample animation frames.
  resample(),

  // Remove unused nodes, textures, materials, etc.
  prune(),

  // Create sparse accessors where >80% of values are zero.
  sparse({ ratio: 0.2 }),

  vertexColorSpace({ inputColorSpace: "srgb" }),

  // Resize all textures to ≤1K and convert to WebP.
  textureCompress({ targetFormat: "webp", resize: [128, 128] })
);
