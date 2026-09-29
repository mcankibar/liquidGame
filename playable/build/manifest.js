// Node-only helpers used by the Vite plugin: loads src/params.js, builds the manifest (the schema
// the dev panel / exporter / Studio read) and reads the asset files.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ASSET_TYPES } from "../kit/fields.js";
import { assetUsage, collectFields, collectLanguages } from "../kit/resolve.js";
import { validateAssetId, validateAsset, detectMime, MODEL_CAPABILITIES } from "../kit/assets.js";
import { FORMAT_VERSION, PLACEHOLDERS } from "./blocks.js";

export async function loadDefinition(paramsFile) {
  // Cache-bust so the dev server picks up edits without a restart.
  const mod = await import(pathToFileURL(paramsFile).href + "?t=" + Date.now());
  if (!mod.default) throw new Error(`${paramsFile} must export default defineConfig({...})`);
  return mod.default;
}

/** Field metadata without the parts only the runtime needs. */
function publicField(f) {
  const out = { ...f };
  if (!out.aliases.length) delete out.aliases;
  if (!out.enabledBy) delete out.enabledBy;
  if (!out.constantDisabled) delete out.constantDisabled;
  if (!out.localized) delete out.localized;
  return out;
}

/**
 * @returns {{ manifest, assets: Array<{ id, type, mime, base64 }> }}
 */
export function buildManifest({ definition, assetsDir, game }) {
  const fields = collectFields(definition);
  const { used, needed } = assetUsage(fields);

  const assetTypes = new Map();
  fields.forEach((f) => {
    if (ASSET_TYPES.includes(f.type)) assetTypes.set(f.default, f.type);
  });

  const missing = [];
  const assets = [];
  const assetInfo = {};
  for (const id of used) {
    const type = assetTypes.get(id);
    validateAssetId(id);
    const file = path.join(assetsDir, id);
    if (fs.existsSync(file) && !fs.realpathSync(file).startsWith(fs.realpathSync(assetsDir) + path.sep))
      throw new Error(`Asset escapes assets directory: ${id}`);
    if (!fs.existsSync(file)) {
      missing.push(id);
      continue;
    }
    // A component that is disabled by a constant can never be enabled by a variant: ship a
    // placeholder instead of the real image.
    const pruned = !needed.has(id) && PLACEHOLDERS[type];
    const bytes = pruned ? null : fs.readFileSync(file);
    const mime = pruned ? PLACEHOLDERS[type].mime : detectMime(bytes);
    const base64 = pruned ? PLACEHOLDERS[type].base64 : bytes.toString("base64");
    for (const field of fields.filter((f) => ASSET_TYPES.includes(f.type) && f.default === id))
      validateAsset(id, { mime, base64 }, field);
    assets.push({ id, type, mime, base64 });
    assetInfo[id] = {
      type,
      mime,
      bytes: pruned ? 0 : bytes.length,
      ...(pruned ? { pruned: true } : {})
    };
  }
  if (missing.length) {
    throw new Error(`src/params.js references files that are not in ${assetsDir}:\n  ${missing.join("\n  ")}`);
  }

  const manifest = {
    format: FORMAT_VERSION,
    schemaVersion: 1,
    capabilities: { models: MODEL_CAPABILITIES },
    game,
    languages: collectLanguages(fields),
    fields: fields.map(publicField),
    assets: assetInfo
  };
  return { manifest, assets };
}
