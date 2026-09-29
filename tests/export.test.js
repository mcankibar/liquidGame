import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import definition from "../src/params.js";
import { buildManifest } from "../playable/build/manifest.js";
import {
  assetsBlock,
  configBlock,
  gameBlock,
  manifestBlock,
  networkBlock,
  replaceBlock,
  readJson,
  readGameCode,
  PLACEHOLDERS
} from "../playable/build/blocks.js";
import { exportVariant, inspectRelease, packageVariant } from "../playable/export/patch.js";
import { EXPORT_NETWORKS } from "../playable/export/networks.js";
import { NETWORKS } from "../playable/kit/networks.js";
import { validateAsset, inspectGlb } from "../playable/kit/assets.js";

const { manifest, assets } = buildManifest({
  definition,
  assetsDir: path.resolve("assets"),
  game: { id: "test" }
});
const code = 'var text="new XMLHttpRequest() window.top";';
const html = `<html><head>${networkBlock("default")}</head><body>${manifestBlock(manifest)}${configBlock(
  {}
)}${assetsBlock(assets)}${gameBlock(code)}</body></html>`;
const logo = "components.inGameLogo1.assets.logo";

test("every profile packages valid JS without modifying game code", () => {
  for (const network of Object.keys(EXPORT_NETWORKS)) {
    const packed = packageVariant(html, { network });
    const script = packed.files.find((f) => f.name.endsWith(".js"))?.data ?? readGameCode(packed.files[0].data);
    assert.equal(script, code, network);
    new vm.Script(script);
    assert.match(packed.files[0].data, /__PL_MODE__="publish"/);
    assert.doesNotMatch(packed.files[0].data, /id="pl-manifest"/);
    assert.equal(packed.report.packageBytes, packed.data.length);
    if (packed.extension === "zip") assert.ok(unzipSync(packed.data)["index.html"]);
  }
});

test("runtime and packaging network catalogs stay in sync", () => {
  assert.deepEqual(Object.keys(EXPORT_NETWORKS).sort(), [...NETWORKS].sort());
  for (const [name, net] of Object.entries(EXPORT_NETWORKS)) {
    assert.ok(net.label, name);
    assert.ok(["html", "zip"].includes(net.container), name);
    assert.ok(["always", "maybe", "never"].includes(net.storeUrl), name);
  }
});

test("store link overrides warn only where the network ignores the URL", () => {
  const overrides = { "options.link.ios": "https://apps.apple.com/app/id1" };
  assert.deepEqual(exportVariant(html, { network: "unity", overrides }).report.warnings, []);
  assert.deepEqual(exportVariant(html, { network: "tiktok" }).report.warnings, []);
  const [warning] = exportVariant(html, { network: "tiktok", overrides }).report.warnings;
  assert.match(warning, /options\.link\.ios has no effect/);
  assert.match(exportVariant(html, { network: "facebook", overrides }).report.warnings[0], /may open/);
});

test("Google and TikTok use their documented SDK entry points", () => {
  const google = exportVariant(html, { network: "google" });
  assert.match(google.files[0].data, /https:\/\/tpc.googlesyndication.com\/pagead\/gadgets\/html5\/api\/exitapi.js/);
  const tiktok = packageVariant(html, { network: "tiktok" });
  const files = unzipSync(tiktok.data);
  assert.deepEqual(JSON.parse(strFromU8(files["config.json"])), {
    playable_orientation: 0
  });
  const page = strFromU8(files["index.html"]);
  // Paths on this CDN are case-sensitive; the capitalized variant returns 404.
  const sdk = "https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js";
  assert.ok(page.includes(`<script src="${sdk}"></script>`));
  assert.ok(page.indexOf(sdk) < page.indexOf('id="pl-game"'));
});

test("missing asset, unknown path, wrong boolean, fractional integer and unknown language are rejected", () => {
  for (const overrides of [
    { [logo]: "missing.png" },
    { "options.isSoundEnabled": "false" },
    { "options.endCardSeconds": 1.5 }
  ]) {
    assert.throws(() => exportVariant(html, { overrides }), /validation failed/);
  }
  assert.throws(() => exportVariant(html, { language: "zz" }), /unsupported language/);
  // Unknown paths (e.g. fields removed in a newer release) are kept as orphans by default...
  const orphaned = exportVariant(html, { overrides: { "options.typo": true } });
  assert.deepEqual(orphaned.report.orphans, ["options.typo"]);
  assert.equal(readJson(orphaned.files[0].data, "config")["options.typo"], undefined);
  // ...and rejected only when strict mode is requested.
  assert.throws(() => exportVariant(html, { strict: true, overrides: { "options.typo": true } }), /validation failed/);
  const tr = exportVariant(html, {
    language: "tr",
    overrides: {
      "components.ctaButton1.localization.caption": { en: "PLAY", tr: "OYNA" }
    }
  });
  assert.equal(readJson(tr.files[0].data, "config")["options.language"], "tr");
});

test("asset path, base64, MIME, signatures and size limits are enforced", () => {
  for (const id of ["../outside.png", "a/../../x", "/absolute.png", "a\\b.png"]) {
    assert.throws(
      () =>
        exportVariant(html, {
          network: "tiktok",
          overrides: { [logo]: id },
          uploads: { [id]: PLACEHOLDERS.image }
        }),
      /Unsafe asset id/
    );
  }
  for (const asset of [
    { mime: "image/png", base64: "</script><script>alert(1)</script>" },
    { ...PLACEHOLDERS.image, mime: 'image/png" onload="x' },
    { mime: "image/png", base64: btoa("not an image") }
  ])
    assert.throws(
      () =>
        exportVariant(html, {
          overrides: { [logo]: "u/probe.png" },
          uploads: { "u/probe.png": asset }
        }),
      /validation failed/
    );
  assert.throws(
    () =>
      validateAsset("a.png", PLACEHOLDERS.image, {
        type: "image",
        maxBytes: 1
      }),
    /size limit/
  );
});

test("release format and duplicate block validation", () => {
  assert.throws(
    () => inspectRelease(replaceBlock(html, "manifest", manifestBlock({ ...manifest, format: 999 }))),
    /Unsupported release format/
  );
  assert.throws(() => inspectRelease(html + configBlock({})), /Duplicate/);
});

test("disabled images are pruned only from exports and shared assets remain usable", () => {
  const id = definition.components.inGameLogo1.assets.logo.default;
  assert.ok(assets.find((a) => a.id === id).base64.length > PLACEHOLDERS.image.base64.length);
  const exported = exportVariant(html, {
    overrides: { "components.inGameLogo1.isEnabled": false }
  });
  // Pruning computes all consumers; a shared active consumer prevents removal.
  assert.ok(exported.report.pruned.length > 0);
  assert.equal(inspectRelease(html).assets.get(id).base64, assets.find((a) => a.id === id).base64);
});

test("ZIP limit uses compressed bytes, HTML limit uses final HTML bytes", () => {
  const large = replaceBlock(html, "game", gameBlock("/*" + "a".repeat(6 * 1024 * 1024) + "*/"));
  assert.throws(() => packageVariant(large), /exceeds/);
  const zipped = packageVariant(large, { network: "google" });
  assert.ok(zipped.report.sizeBytes > 5 * 1024 * 1024);
  assert.ok(zipped.data.length < 5 * 1024 * 1024);
});

test("CLI validates complete batches before writing and preserves Mintegral entry filename", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-cli-"));
  try {
    const release = path.join(dir, "release.html");
    fs.writeFileSync(release, html);
    const out = path.join(dir, "out");
    const invalid = spawnSync(
      process.execPath,
      ["playable/export/cli.js", `--release=${release}`, `--out=${out}`, "--langs=en,zz"],
      { encoding: "utf8" }
    );
    assert.equal(invalid.status, 1);
    assert.equal(fs.existsSync(out), false);
    const valid = spawnSync(
      process.execPath,
      ["playable/export/cli.js", "--release", release, "--out", out, "--networks", "mintegral"],
      { encoding: "utf8" }
    );
    assert.equal(valid.status, 0, valid.stderr);
    assert.ok(fs.existsSync(path.join(out, "test_default_mintegral_auto/mintegral.html")));
    const report = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8"));
    assert.equal(report.exports.length, 1);
    assert.equal(report.exports[0].path, "test_default_mintegral_auto/mintegral.html");
    assert.equal(report.exports[0].storeUrl, "never");
    // Validation errors leave earlier outputs and their report untouched.
    spawnSync(process.execPath, ["playable/export/cli.js", `--release=${release}`, `--out=${out}`, "--langs=zz"]);
    assert.ok(fs.existsSync(path.join(out, "report.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GLB decoder and external resource dependencies are rejected", () => {
  const glb = (json) => {
    const body = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4));
    const buf = Buffer.alloc(20 + body.length);
    buf.write("glTF");
    buf.writeUInt32LE(2, 4);
    buf.writeUInt32LE(buf.length, 8);
    buf.writeUInt32LE(body.length, 12);
    buf.writeUInt32LE(0x4e4f534a, 16);
    body.copy(buf, 20);
    return buf;
  };
  assert.throws(() => inspectGlb(glb({ extensionsUsed: ["KHR_draco_mesh_compression"] })), /not supported/);
  assert.throws(() => inspectGlb(glb({ images: [{ uri: "other.png" }] })), /external resources/);
  assert.doesNotThrow(() => inspectGlb(glb({ asset: { version: "2.0" } })));
});
