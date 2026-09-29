import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { buildManifest } from "../playable/build/manifest.js";
import {
  assetsBlock,
  configBlock,
  gameBlock,
  manifestBlock,
  networkBlock,
  PLACEHOLDERS
} from "../playable/build/blocks.js";
import { exportVariant } from "../playable/export/patch.js";
import { detectMime, validateAsset } from "../playable/kit/assets.js";
import { atlas, spine, data } from "../playable/kit/fields.js";

const PNG = Buffer.from(PLACEHOLDERS.image.base64, "base64");
const ATLAS_JSON = JSON.stringify({ frames: { "red.png": { frame: { x: 0, y: 0, w: 1, h: 1 } } } });
const SPINE_ATLAS =
  "hero.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  bounds: 0,0,1,1\n";
const SPINE_ZIP = zipSync({ "hero.json": strToU8('{"skeleton":{"spine":"4.2.43"}}') });

const definition = {
  components: {
    board: {
      assets: {
        gems: atlas("gems", "gems/gems.png", "gems/gems.json"),
        hero: spine("hero", "spines/hero/hero.png", "spines/hero/hero.json.zip", "spines/hero/hero.atlas.txt")
      }
    }
  }
};

function withAssets(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-assets-"));
  try {
    const put = (name, bytes) => {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), bytes);
    };
    put("gems/gems.png", PNG);
    put("gems/gems.json", ATLAS_JSON);
    put("spines/hero/hero.png", PNG);
    put("spines/hero/hero.json.zip", SPINE_ZIP);
    put("spines/hero/hero.atlas.txt", SPINE_ATLAS);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("atlas() and spine() declare keyed files routed to their loaders", () => {
  const [png, json] = atlas("gems", "a.png", "a.json");
  assert.deepEqual([png.type, png.key, png.loader, png.variant], ["image", "gems_PNG", "atlas", "image"]);
  assert.deepEqual([json.type, json.key, json.loader, json.variant], ["data", "gems_JSON", "atlas", "JSON"]);
  const parts = spine("hero", "h.png", "h.json.zip", "h.atlas.txt");
  assert.deepEqual(
    parts.map((p) => [p.type, p.key, p.variant]),
    [
      ["image", "hero_PNG", "image"],
      ["data", "hero_JSON", "JSON"],
      ["data", "hero_ATLAS_TXT", "atlasTxt"]
    ]
  );
  assert.ok(parts.every((p) => p.loader === "spine"));
});

test("JSON, text and ZIP data files are detected and validated", () => {
  assert.equal(detectMime(Buffer.from(ATLAS_JSON)), "application/json");
  assert.equal(detectMime(Buffer.from(SPINE_ATLAS)), "text/plain");
  assert.equal(detectMime(SPINE_ZIP), "application/zip");
  assert.throws(() => detectMime(Uint8Array.from([0, 1, 2, 3, 0xff, 0xfe])), /Unsupported/);
  const field = data("x.json");
  assert.doesNotThrow(() =>
    validateAsset("x.json", { mime: "application/json", base64: Buffer.from(ATLAS_JSON).toString("base64") }, field)
  );
  // A PNG cannot be smuggled in as a data file, and a text file cannot claim to be JSON.
  assert.throws(() => validateAsset("x.json", { mime: "application/json", base64: PLACEHOLDERS.image.base64 }, field));
  assert.throws(() =>
    validateAsset("x.json", { mime: "application/json", base64: Buffer.from(SPINE_ATLAS).toString("base64") }, field)
  );
});

test("spine and atlas files are embedded by the build and survive export", () =>
  withAssets((assetsDir) => {
    const { manifest, assets } = buildManifest({ definition, assetsDir, game: { id: "test" } });
    const mimes = Object.fromEntries(assets.map((a) => [a.id, a.mime]));
    assert.deepEqual(mimes, {
      "gems/gems.png": "image/png",
      "gems/gems.json": "application/json",
      "spines/hero/hero.png": "image/png",
      "spines/hero/hero.json.zip": "application/zip",
      "spines/hero/hero.atlas.txt": "text/plain"
    });
    const html = `<html><head>${networkBlock("default")}</head><body>${manifestBlock(manifest)}${configBlock(
      {}
    )}${assetsBlock(assets)}${gameBlock("void 0;")}</body></html>`;
    const { report } = exportVariant(html, { network: "tiktok" });
    assert.deepEqual(report.orphans, []);
  }));

test("the runtime hands parsed JSON, atlas text and zipped skeletons to the loaders", async () =>
  withAssets(async (assetsDir) => {
    const { assets } = buildManifest({ definition, assetsDir, game: { id: "test" } });
    const blocks = assets.map((a) => ({
      getAttribute: (name) => ({ "data-pl-asset": a.id, "data-mime": a.mime }[name] ?? null),
      hasAttribute: (name) => name === "data-mime",
      textContent: a.base64
    }));
    globalThis.window = { __PL_MODE__: "publish", name: "", addEventListener() {} };
    globalThis.document = { getElementById: () => null, querySelectorAll: () => blocks };
    try {
      const { createRuntime } = await import("../playable/kit/runtime.js?assets-test");
      const { config } = createRuntime(definition);
      const [gemsPng, gemsJson] = config.components.board.assets.gems;
      assert.equal(gemsPng.key, "gems_PNG");
      assert.equal(gemsPng.loader, "atlas");
      assert.match(gemsPng.data, /^data:image\/png;base64,/);
      assert.deepEqual(gemsJson.data, JSON.parse(ATLAS_JSON));
      const [, skeleton, atlasText] = config.components.board.assets.hero;
      assert.match(skeleton.data, /^data:application\/zip;base64,/);
      assert.equal(atlasText.data, SPINE_ATLAS);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
    }
  }));
