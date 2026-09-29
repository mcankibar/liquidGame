// Dev-only parameter panel (loaded by src/entry.js under `npm run dev`, never in builds).
// It generates a form from src/params.js, applies changes through the same preview mechanism the
// Studio will use (live when possible, otherwise a restart with the overrides — see
// updatePreview in playable/kit/runtime.js), and downloads the result as a variant file that
// `npm run export -- --variant=...` understands. Fields marked ↻ restart the game.

import { detectMime, validateAsset } from "../kit/assets.js";
import { ASSET_TYPES } from "../kit/fields.js";
import { collectFields, collectLanguages, normalizeValue, toLocalized } from "../kit/resolve.js";
import {
  applyPreview,
  clearPreview,
  getDefinition,
  onDefinitionChange,
  readPreviewState,
  updatePreview
} from "../kit/runtime.js";

const STYLES = `
#pl-dev-toggle{position:fixed;left:8px;bottom:8px;z-index:9999;font:12px/1 system-ui,sans-serif;padding:8px 10px;border-radius:6px;border:0;background:#1f2937;color:#fff;cursor:pointer;opacity:.85}
#pl-dev{position:fixed;top:0;left:0;bottom:0;width:340px;z-index:9998;background:#111827f2;color:#e5e7eb;font:12px/1.4 system-ui,sans-serif;display:none;flex-direction:column}
#pl-dev.open{display:flex}
#pl-dev header{display:flex;gap:6px;flex-wrap:wrap;padding:10px;border-bottom:1px solid #374151;align-items:center}
#pl-dev header b{flex:1 0 100%;font-size:13px}
#pl-dev button{font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;cursor:pointer}
#pl-dev button.primary{background:#2563eb;border-color:#2563eb}
#pl-dev .body{overflow:auto;padding:4px 10px 40px}
#pl-dev details{border-bottom:1px solid #1f2937;padding:4px 0}
#pl-dev summary{cursor:pointer;padding:4px 0;font-weight:600}
#pl-dev .row{display:grid;grid-template-columns:1fr auto;gap:4px 6px;align-items:center;padding:3px 0 3px 6px;border-left:2px solid transparent}
#pl-dev .row.changed{border-left-color:#f59e0b}
#pl-dev .row label{grid-column:1/-1;color:#9ca3af;display:flex;justify-content:space-between}
#pl-dev .row label a{color:#f59e0b;cursor:pointer;text-decoration:none}
#pl-dev .ctl{grid-column:1/-1;display:flex;gap:6px;align-items:center}
#pl-dev input[type=text],#pl-dev input[type=number],#pl-dev select{flex:1;min-width:0;background:#0b1220;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:3px 5px;font:inherit}
#pl-dev input[type=range]{flex:1}
#pl-dev input[type=number].small{flex:0 0 64px}
#pl-dev img.thumb{width:36px;height:36px;object-fit:contain;background:#374151;border-radius:3px}
#pl-dev .lang{flex:0 0 22px;color:#9ca3af;text-transform:uppercase}
`;

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  });
  children.flat().forEach((c) => c != null && node.append(c));
  return node;
};

const toHex = (v) => (typeof v === "number" ? "#" + v.toString(16).padStart(6, "0") : String(v));

async function sha(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function assetPreviewSrc(id, uploads) {
  if (uploads[id]) return uploads[id];
  const block = document.querySelector(`script[data-pl-asset="${CSS_ESCAPE(id)}"]`);
  return block ? `data:${block.getAttribute("data-mime")};base64,${block.textContent.trim()}` : "";
}
// Mirrors needsRestart in playable/kit/runtime.js (for the ↻ hint only).
const restartsGame = (f) =>
  f.restart === true ||
  f.type === "language" ||
  /(^|\.)isEnabled$/.test(f.path) ||
  !!f.loader ||
  (ASSET_TYPES.includes(f.type) && f.type !== "image");

const CSS_ESCAPE = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : s);

export function mountDevPanel() {
  // The definition comes from the runtime so that editing src/params.js hot-updates this panel.
  let fields = collectFields(getDefinition());
  const preview = readPreviewState() || { overrides: {}, assets: {} };
  const overrides = { ...preview.overrides };
  const uploads = { ...preview.assets };
  let languages = collectLanguages(fields, overrides);
  let autoApply = true;
  let timer = null;

  document.head.append(el("style", {}, STYLES));
  const panel = el("div", { id: "pl-dev" });
  const toggle = el("button", {
    id: "pl-dev-toggle",
    onclick: () => panel.classList.toggle("open")
  });
  const body = el("div", { class: "body" });
  const status = el("div", { role: "alert", style: "padding:4px 10px;color:#fca5a5" });

  const changedCount = () => Object.keys(overrides).length;
  const updateToggle = () => (toggle.textContent = `⚙ Params${changedCount() ? ` (${changedCount()} changed)` : ""}`);

  const apply = () => updatePreview(overrides, uploads);
  const restart = () => applyPreview(overrides, uploads);
  const scheduleApply = () => {
    updateToggle();
    if (!autoApply) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  };

  function set(field, value) {
    const result = normalizeValue(field, value);
    if (result.error) {
      status.textContent = `${field.label}: ${result.error}`;
      return;
    }
    status.textContent = "";
    value = result.value;
    const norm = (v) => JSON.stringify(normalizeValue(field, v).value);
    const isDefault = norm(value) === norm(field.default);
    if (isDefault) delete overrides[field.path];
    else overrides[field.path] = value;
    scheduleApply();
    render();
  }

  function control(field) {
    const value = field.path in overrides ? overrides[field.path] : field.default;
    switch (field.type) {
      case "number": {
        const num = el("input", {
          type: "number",
          class: field.min !== undefined ? "small" : "",
          value,
          step: field.step ?? "any",
          onchange: (e) => set(field, Number(e.target.value))
        });
        if (field.min === undefined || field.max === undefined) return [num];
        const range = el("input", {
          type: "range",
          min: field.min,
          max: field.max,
          step: field.step ?? "any",
          value,
          oninput: (e) => (num.value = e.target.value),
          onchange: (e) => set(field, Number(e.target.value))
        });
        return [range, num];
      }
      case "boolean":
        return [
          el("input", {
            type: "checkbox",
            checked: !!value,
            onchange: (e) => set(field, e.target.checked)
          })
        ];
      case "color":
        return [
          el("input", {
            type: "color",
            value: toHex(value),
            onchange: (e) => set(field, e.target.value)
          }),
          toHex(value)
        ];
      case "select":
      case "language": {
        const options = field.type === "language" ? ["auto", ...languages] : field.options;
        return [
          el(
            "select",
            { onchange: (e) => set(field, e.target.value) },
            options.map((o) => el("option", { value: o, selected: o === value }, o))
          )
        ];
      }
      case "text": {
        if (!field.localized) {
          return [
            el("input", {
              type: "text",
              value,
              onchange: (e) => set(field, e.target.value)
            })
          ];
        }
        const map = toLocalized(value);
        return languages.map((lang) =>
          el(
            "div",
            { class: "ctl" },
            el("span", { class: "lang" }, lang),
            el("input", {
              type: "text",
              value: map[lang] ?? "",
              placeholder: lang === "en" ? "" : map.en,
              onchange: (e) => {
                const next = { ...map, [lang]: e.target.value };
                if (lang !== "en" && !e.target.value) delete next[lang];
                set(field, next);
              }
            })
          )
        );
      }
      default: {
        // asset
        const input = el("input", {
          type: "file",
          accept: {
            image: ".png,.jpg,.jpeg,.webp,.gif",
            sound: ".mp3,.aac,.ogg,.wav,.m4a",
            model: ".glb,.zip",
            font: ".woff,.woff2,.ttf,.otf"
          }[field.type],
          onchange: async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const bytes = await file.arrayBuffer();
              const ext = file.name.split(".").pop().toLowerCase();
              const id = `u/${await sha(bytes)}.${ext}`;
              const mime = detectMime(new Uint8Array(bytes));
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(",")[1]);
                reader.onerror = () => reject(new Error("File could not be read"));
                reader.readAsDataURL(file);
              });
              validateAsset(id, { mime, base64 }, field);
              uploads[id] = `data:${mime};base64,${base64}`;
              set(field, id);
            } catch (error) {
              status.textContent = error.message;
            }
          }
        });
        const thumb =
          field.type === "image"
            ? el("img", {
                class: "thumb",
                src: assetPreviewSrc(value, uploads)
              })
            : null;
        return [thumb, el("span", { title: value }, String(value).split("/").pop()), input];
      }
    }
  }

  function render() {
    const open = new Set([...body.querySelectorAll("details[open]")].map((d) => d.dataset.group));
    body.textContent = "";
    const groups = new Map();
    fields.forEach((f) => {
      if (!groups.has(f.group)) groups.set(f.group, []);
      groups.get(f.group).push(f);
    });
    groups.forEach((list, name) => {
      const changed = list.filter((f) => f.path in overrides).length;
      body.append(
        el(
          "details",
          { "data-group": name, open: open.has(name) },
          el("summary", {}, `${name}${changed ? `  •${changed}` : ""}`),
          list.map((f) => {
            const isChanged = f.path in overrides;
            return el(
              "div",
              { class: `row${isChanged ? " changed" : ""}`, title: f.path },
              el(
                "label",
                {},
                (ASSET_TYPES.includes(f.type) ? `${f.label} (${f.type})` : f.label) + (restartsGame(f) ? " ↻" : ""),
                isChanged
                  ? el(
                      "a",
                      {
                        onclick: () => set(f, f.default),
                        title: "Back to default"
                      },
                      "↺"
                    )
                  : null
              ),
              el("div", { class: "ctl" }, control(f))
            );
          })
        )
      );
    });
  }

  const download = () => {
    const variant = { name: "dev-panel", overrides, uploads: {} };
    Object.values(overrides).forEach((v) => {
      if (typeof v === "string" && uploads[v]) variant.uploads[v] = uploads[v];
    });
    const blob = new Blob([JSON.stringify(variant, null, 2)], {
      type: "application/json"
    });
    el("a", {
      href: URL.createObjectURL(blob),
      download: "variant.json"
    }).click();
  };

  const addLanguage = () => {
    const lang = (prompt("Language code (e.g. tr, de, pt-br):") || "").trim().toLowerCase();
    if (lang && !languages.includes(lang)) {
      languages = [...languages, lang];
      render();
    }
  };

  panel.append(
    el(
      "header",
      {},
      el("b", {}, "Playable params (dev)"),
      el("button", { class: "primary", onclick: apply }, "Apply"),
      el("button", { onclick: restart, title: "Restart the game with the current values" }, "Restart"),
      el(
        "label",
        {},
        el("input", {
          type: "checkbox",
          checked: true,
          onchange: (e) => (autoApply = e.target.checked)
        }),
        " auto"
      ),
      el("button", { onclick: addLanguage }, "+ language"),
      el("button", { onclick: download }, "Download variant"),
      el("button", { onclick: clearPreview }, "Reset all")
    ),
    status,
    body
  );
  document.body.append(panel, toggle);
  updateToggle();
  render();
  onDefinitionChange((definition) => {
    fields = collectFields(definition);
    render();
  });
  if (changedCount()) panel.classList.add("open");
}
