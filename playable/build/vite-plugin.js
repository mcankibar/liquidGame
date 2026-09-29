// Vite plugin that turns the game into ONE patchable HTML file (see ./blocks.js).
//
//   vite        → dev server; index.html gets the same blocks, the game runs as ES modules
//   vite build  → dist/index.html (single file, game bundled as an IIFE) + dist/manifest.json
//
// The build is network-agnostic ("default"). Ad-network variants, languages and variant overrides
// are applied later by the exporter (playable/export) without rebuilding.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assetsBlock, configBlock, gameBlock, manifestBlock, networkBlock } from "./blocks.js";
import { buildManifest, loadDefinition } from "./manifest.js";

const HEAD_MARKER = "<!--pl:head-->";
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const BODY_MARKER = "<!--pl:body-->";

export default function playable(options = {}) {
  const {
    entry = "src/entry.js",
    params = "src/params.js",
    assetsDir = "assets",
    template = "index.html",
    sizeWarningMb = 5
  } = options;

  let root;
  let isBuild = false;

  const abs = (p) => path.resolve(root, p);

  function gameInfo() {
    const pkg = JSON.parse(fs.readFileSync(abs("package.json"), "utf8"));
    return {
      id: pkg.name,
      title: (pkg.playable && pkg.playable.title) || pkg.name,
      version: pkg.version,
      builtAt: new Date().toISOString()
    };
  }

  async function blocks() {
    const definition = await loadDefinition(abs(params));
    const { manifest, assets } = buildManifest({
      definition,
      assetsDir: abs(assetsDir),
      game: gameInfo()
    });
    return { manifest, assets };
  }

  function fillTemplate(html, title, head, body) {
    if (!html.includes(HEAD_MARKER) || !html.includes(BODY_MARKER)) {
      throw new Error(`${template} must contain ${HEAD_MARKER} and ${BODY_MARKER}`);
    }
    // Function replacers: the game code contains "$&"-like sequences that string replacements
    // would interpret as patterns.
    return html
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
      .replace(HEAD_MARKER, () => head)
      .replace(BODY_MARKER, () => body);
  }

  return {
    name: "playable",
    enforce: "post",

    config(userConfig, { command }) {
      isBuild = command === "build";
      if (!isBuild) return {};
      return {
        build: {
          target: userConfig.build?.target ?? "es2018",
          outDir: userConfig.build?.outDir ?? "dist",
          emptyOutDir: userConfig.build?.emptyOutDir ?? true,
          copyPublicDir: false,
          modulePreload: false,
          cssCodeSplit: false,
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          reportCompressedSize: false,
          rollupOptions: {
            input: entry,
            output: {
              format: "iife",
              inlineDynamicImports: true,
              entryFileNames: "game.js"
            }
          }
        },
        esbuild: {
          legalComments: "none",
          pure: ["console.log", "console.debug", "console.info"]
        }
      };
    },

    configResolved(config) {
      root = config.root;
    },

    // ── dev server ────────────────────────────────────────────────────────
    configureServer(server) {
      server.watcher.add(abs(assetsDir));
      const reload = (file) => {
        // src/params.js is hot-updated by the game itself (import.meta.hot in src/main.js).
        if (file.startsWith(abs(assetsDir))) server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },

    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        if (isBuild) return html;
        const { manifest, assets } = await blocks();
        return fillTemplate(
          html,
          manifest.game.title,
          networkBlock("default"),
          [
            manifestBlock(manifest),
            configBlock({}),
            assetsBlock(assets),
            `<script type="module" src="/${entry}"></script>`
          ].join("\n")
        );
      }
    },

    // ── build ─────────────────────────────────────────────────────────────
    async generateBundle(_, bundle) {
      const chunk = Object.values(bundle).find((f) => f.type === "chunk" && f.isEntry);
      if (!chunk) this.error("no entry chunk produced");
      const styles = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (item === chunk) continue;
        if (item.type === "asset" && name.endsWith(".css")) {
          const css = String(item.source);
          if (/<\/style/i.test(css)) this.error("CSS contains an unsafe closing style tag");
          styles.push(`<style>${css}</style>`);
        } else this.error(`Unsupported single-file output: ${name}. Inline it or declare it in params.js.`);
      }
      Object.keys(bundle).forEach((name) => delete bundle[name]);

      const { manifest, assets } = await blocks();
      manifest.releaseId = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            code: chunk.code,
            styles,
            template: fs.readFileSync(abs(template), "utf8"),
            fields: manifest.fields,
            assets,
            game: { ...manifest.game, builtAt: undefined }
          })
        )
        .digest("hex");
      const html = fillTemplate(
        fs.readFileSync(abs(template), "utf8"),
        manifest.game.title,
        [networkBlock("default"), ...styles].join("\n"),
        [manifestBlock(manifest), configBlock({}), assetsBlock(assets), gameBlock(chunk.code)].join("\n")
      );

      this.emitFile({ type: "asset", fileName: "index.html", source: html });
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2)
      });

      const mb = Buffer.byteLength(html) / 1024 / 1024;
      const assetMb = assets.reduce((n, a) => n + a.base64.length, 0) / 1024 / 1024;
      const msg = `playable: index.html ${mb.toFixed(2)} MB (assets ${assetMb.toFixed(2)} MB, code ${(
        chunk.code.length /
        1024 /
        1024
      ).toFixed(2)} MB), ${manifest.fields.length} editable fields`;
      if (mb > sizeWarningMb) this.warn(`${msg} — over ${sizeWarningMb} MB`);
      else console.log("\n" + msg);
    }
  };
}
