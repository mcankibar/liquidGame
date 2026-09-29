import { modelBytes, inspectGlb } from "../../../playable/kit/assets.js";

/** Extract the single real GLB, excluding ZIP metadata, with bounded decompression. */
export async function extractGlbFromZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const zipped = !(bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46);
  const glb = modelBytes(bytes, zipped);
  inspectGlb(glb);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}
