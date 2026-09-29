#!/usr/bin/env node
// Exports a release for ad networks, optionally with a variant — without rebuilding the game.
//
//   npm run export -- --variant variants/red-cta.json --networks applovin,unity --langs en,tr
//
// Variant file (JSON):
//   {
//     "name": "red-cta",
//     "overrides": {
//       "components.ctaButton1.localization.caption": { "en": "PLAY", "tr": "OYNA" },
//       "components.ctaButton1.assets.ctaButton": "file:red-cta.png"      ← relative to the variant file
//     },
//     "uploads": { "u/1a2b3c4d5e6f.png": "data:image/png;base64,..." }   ← optional, e.g. from the dev panel
//   }

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { packageVariant, inspectRelease } from "./patch.js";
import { EXPORT_NETWORK_NAMES, NETWORK_PROFILE_VERSION } from "./networks.js";
import { detectMime } from "../kit/assets.js";

function parseArgs(argv) {
  const args = {
    release: "dist/index.html",
    variants: [],
    networks: ["default"],
    langs: ["auto"],
    out: "exports",
    strict: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--") && arg !== "-h") throw new Error(`Unknown argument: ${arg}`);
    if (arg === "--strict") {
      args.strict = true;
      continue;
    }
    const raw = arg.replace(/^--?/, "");
    const eq = raw.indexOf("=");
    const key = eq < 0 ? raw : raw.slice(0, eq);
    const value = eq < 0 ? (["help", "h"].includes(key) ? "" : argv[++i]) : raw.slice(eq + 1);
    if (!["help", "h"].includes(key) && (!value || value.startsWith("--"))) throw new Error(`Missing --${key} value`);
    const list = (value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (key === "release") args.release = value;
    else if (key === "variant") args.variants.push(value);
    else if (key === "networks") args.networks = value === "all" ? EXPORT_NETWORK_NAMES : list;
    else if (key === "langs") args.langs = list;
    else if (key === "out") args.out = value;
    else if (key === "help" || key === "h") {
      console.log(`Usage: npm run export -- [--variant=file.json]... [--networks=a,b|all] [--langs=auto|en,tr] [--release=dist/index.html] [--out=exports] [--strict]
Networks: ${EXPORT_NETWORK_NAMES.join(", ")}`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg} (use --key=value)`);
      process.exit(1);
    }
  }
  if (!args.networks.length || !args.langs.length) throw new Error("Networks/languages cannot be empty");
  for (const name of args.networks)
    if (!EXPORT_NETWORK_NAMES.includes(name)) throw new Error(`Unknown network: ${name}`);
  return args;
}

function parseDataUri(uri) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(uri);
  if (!m) throw new Error("uploads must be base64 data URIs");
  return { mime: m[1], base64: m[2] };
}

function loadVariant(file) {
  if (!file) return { name: "default", overrides: {}, uploads: {} };
  const variant = JSON.parse(fs.readFileSync(file, "utf8"));
  const dir = path.dirname(file);
  const overrides = { ...(variant.overrides || {}) };
  const uploads = Object.create(null);
  Object.entries(variant.uploads || {}).forEach(([id, uri]) => (uploads[id] = parseDataUri(uri)));

  // "file:relative/path.png" → content-addressed upload id
  Object.entries(overrides).forEach(([p, value]) => {
    if (typeof value !== "string" || !value.startsWith("file:")) return;
    const abs = path.resolve(dir, value.slice(5));
    const bytes = fs.readFileSync(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const id = `u/${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.${ext}`;
    uploads[id] = { mime: detectMime(bytes), base64: bytes.toString("base64") };
    overrides[p] = id;
  });

  return {
    name: variant.name || path.basename(file, ".json"),
    overrides,
    uploads
  };
}

const slug = (s) =>
  String(s)
    .replace(/^@[^/]+\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-");
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, data, { flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + " MB";

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.release)) {
    console.error(`Release not found: ${args.release} — run "npm run build" first.`);
    process.exit(1);
  }
  const html = fs.readFileSync(args.release, "utf8");
  const { manifest } = inspectRelease(html);
  const variants = (args.variants.length ? args.variants : [null]).map(loadVariant);
  // Validate and package the complete batch before writing anything.
  const outputs = new Map();
  for (const variant of variants) {
    for (const network of args.networks) {
      for (const lang of args.langs) {
        const packed = packageVariant(html, {
          overrides: variant.overrides,
          uploads: variant.uploads,
          network,
          language: lang,
          strict: args.strict
        });
        const base = [slug(manifest.game.id), slug(variant.name), slug(network), slug(lang)].join("_");
        // Preserve a network-mandated entry filename without colliding across variants.
        const outFile =
          packed.extension === "html" && packed.entryName !== "index.html"
            ? path.join(args.out, base, packed.entryName)
            : path.join(args.out, `${base}.${packed.extension}`);
        if (outputs.has(outFile)) throw new Error(`Duplicate output: ${outFile}`);
        outputs.set(outFile, { ...packed, variant: variant.name });
      }
    }
  }
  // report.json is written last and removed first: a folder without it is an interrupted batch.
  const reportFile = path.join(args.out, "report.json");
  fs.rmSync(reportFile, { force: true });
  const entries = [];
  for (const [outFile, { data, report, variant }] of outputs) {
    writeAtomic(outFile, data);
    console.log(
      `✓ ${outFile}  ${mb(data.length)}  ${report.applied} override(s), ${
        report.pruned.length
      } disabled image(s) stripped`
    );
    if (report.orphans.length)
      console.warn(`  ! ignored unknown paths (removed/renamed fields?): ${report.orphans.join(", ")}`);
    report.warnings.forEach((w) => console.warn(`  ! ${w}`));
    entries.push({
      variant,
      network: report.network,
      language: report.language,
      path: path.relative(args.out, outFile).split(path.sep).join("/"),
      packageBytes: report.packageBytes,
      sizeBytes: report.sizeBytes,
      storeUrl: report.storeUrl,
      warnings: report.warnings,
      orphans: report.orphans,
      pruned: report.pruned
    });
  }
  const summary = {
    releaseId: manifest.releaseId ?? null,
    game: manifest.game.id,
    profileVersion: NETWORK_PROFILE_VERSION,
    createdAt: new Date().toISOString(),
    exports: entries
  };
  writeAtomic(reportFile, JSON.stringify(summary, null, 2) + "\n");
  console.log(`✓ ${reportFile}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
