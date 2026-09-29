import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { build } from "vite";
import playable from "../playable/build/vite-plugin.js";
import { readGameCode } from "../playable/build/blocks.js";
import { inspectRelease, packageVariant } from "../playable/export/patch.js";
import { EXPORT_NETWORK_NAMES } from "../playable/export/networks.js";

test("real production build embeds CSS, honors outDir, and exports every network", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-build-"));
  try {
    fs.writeFileSync(
      path.join(dir, "entry.js"),
      `import './style.css'; import ${JSON.stringify(path.resolve("src/entry.js"))};`
    );
    fs.writeFileSync(path.join(dir, "style.css"), "body{--playable-css-test:987654}");
    const out = path.join(dir, "out");
    await build({
      configFile: false,
      logLevel: "warn",
      plugins: [playable({ entry: path.join(dir, "entry.js") })],
      build: { outDir: out }
    });
    assert.deepEqual(fs.readdirSync(out).sort(), ["index.html", "manifest.json"]);
    const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
    assert.ok(html.includes("--playable-css-test:987654"), "imported CSS must be embedded");
    assert.match(inspectRelease(html).manifest.releaseId, /^[0-9a-f]{64}$/);
    const original = readGameCode(html);
    for (const network of EXPORT_NETWORK_NAMES) {
      const { files } = packageVariant(html, { network });
      const code = files.find((f) => f.name.endsWith(".js"))?.data ?? readGameCode(files[0].data);
      assert.equal(code, original);
      new vm.Script(code);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
