// Browser runtime: turns src/params.js + the data blocks embedded in the HTML into the gameConfig.
//
// The exported HTML carries its data in patchable blocks (written by the build, rewritten by the
// exporter — see playable/export/patch.js):
//   <script type="application/json" id="pl-config">{ ...override map... }</script>
//   <script type="text/plain" data-pl-asset="logo.png" data-mime="image/png">BASE64</script>
//   <script type="text/plain" data-pl-asset="logo.png" data-src="assets/logo.png"></script>  (path mode)
//
// Preview: a parent window (Studio / dev panel) sends { type: "pl:preview", overrides, assets }. The
// values are applied to the running game when possible (see "Live preview" below), otherwise the
// page reloads itself with those values. The values survive the reload in window.name, so this
// works in sandboxed iframes and without any storage permission.

import { collectFields, resolveConfig, sanitizeOverrides } from "./resolve.js";
import { ASSET_TYPES } from "./fields.js";
import { getNetworkSettings } from "./networks.js";

const previewEnabled = () => window.__PL_MODE__ === "preview";

const PREVIEW_PREFIX = "pl-preview:";
const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function readJsonBlock(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "null");
  } catch (e) {
    console.error(`[playable] invalid JSON in #${id}`, e);
    return null;
  }
}

export function readPreviewState() {
  if (!previewEnabled()) return null;
  if (typeof window.name !== "string" || !window.name.startsWith(PREVIEW_PREFIX)) return null;
  try {
    return JSON.parse(window.name.slice(PREVIEW_PREFIX.length));
  } catch (e) {
    return null;
  }
}

/** Reloads the page with the given overrides/assets (assets: { id: dataUri }). */
export function applyPreview(overrides = {}, assets = {}) {
  if (!previewEnabled()) return;
  window.name = PREVIEW_PREFIX + JSON.stringify({ overrides, assets });
  window.location.reload();
}

export function clearPreview() {
  if (!previewEnabled()) return;
  window.name = "";
  window.location.reload();
}

/** JSON data URIs become objects, text ones strings (ZIPs stay data URIs for their loaders). */
function decodeDataUri(uri) {
  const [head, body = ""] = uri.split(",");
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  if (/^data:application\/json/.test(head)) {
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("[playable] invalid JSON asset", e);
      return null;
    }
  }
  return text;
}

function collectAssetBlocks() {
  const blocks = new Map();
  document.querySelectorAll("script[data-pl-asset]").forEach((el) => {
    blocks.set(el.getAttribute("data-pl-asset"), el);
  });
  return blocks;
}

function makeAssetEntry(blocks, previewAssets) {
  return (id, field) => {
    const entry = { key: field.key || id, type: field.type };
    if (field.variant) entry.variant = field.variant;
    if (field.loader) entry.loader = field.loader;

    let dataUri = previewAssets[id];
    const block = blocks.get(id);
    if (!dataUri && block && block.hasAttribute("data-src")) {
      // Path mode (e.g. TikTok): the file sits next to index.html; loaders prefix "./assets/".
      entry.assetPath = block.getAttribute("data-src").replace(/^\.?\/?assets\//, "");
      return entry;
    }
    if (!dataUri && block) {
      dataUri = `data:${block.getAttribute("data-mime")};base64,${block.textContent.trim()}`;
    }
    if (!dataUri) {
      console.error(`[playable] asset "${id}" (${field.path}) is missing from the HTML`);
      dataUri = field.type === "image" ? TRANSPARENT_PNG : "data:application/octet-stream;base64,";
    }

    const isZip = /\.zip$/i.test(id) || dataUri.startsWith("data:application/zip");
    if (field.type === "model" && isZip) entry.zipData = dataUri;
    else if (field.type === "data" && !isZip) entry.data = decodeDataUri(dataUri);
    else entry.data = dataUri;
    return entry;
  };
}

/**
 * @param definition the object exported by src/params.js
 * @returns {{ config, fields, languages, overrides, network, isPreview }}
 */
export function createRuntime(definition) {
  const preview = readPreviewState();
  const embedded = readJsonBlock("pl-config") || {};
  const raw = { ...embedded, ...(preview ? preview.overrides : {}) };

  const fields = collectFields(definition);
  const { values, orphans, errors } = sanitizeOverrides(fields, raw);
  if (orphans.length) console.warn("[playable] ignored unknown config paths:", orphans);
  if (errors.length) console.warn("[playable] ignored invalid values:", errors);

  const previewAssets = (preview && preview.assets) || {};
  const entry = makeAssetEntry(collectAssetBlocks(), previewAssets);
  const { config, languages } = resolveConfig(definition, values, entry);
  live.state = { definition, fields, embedded, values, assets: previewAssets };

  listenForPreviewMessages();
  if (previewEnabled() && window.parent && window.parent !== window && window.location.origin !== "null") {
    window.parent.postMessage({ type: "pl:ready", overrides: values, languages }, window.location.origin);
  }

  return {
    config,
    fields,
    languages,
    overrides: values,
    network: getNetworkSettings(),
    isPreview: !!preview
  };
}

let listening = false;
function listenForPreviewMessages() {
  if (listening || !previewEnabled()) return;
  listening = true;
  window.addEventListener("message", (event) => {
    if (!previewEnabled() || event.source !== window.parent || event.source === window) return;
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    const token = window.__PL_PREVIEW_TOKEN__;
    const sameOrigin = event.origin !== "null" && event.origin === window.location.origin;
    const authenticated = typeof token === "string" && token.length >= 16 && msg.token === token;
    if (token ? !authenticated : !sameOrigin) return;
    if (msg.type === "pl:preview") updatePreview(msg.overrides || {}, msg.assets || {});
    else if (msg.type === "pl:reset") clearPreview();
    else if (msg.type === "pl:inspect") setInspecting(!!msg.enabled);
    else if (msg.type === "pl:highlight") highlight(typeof msg.componentId === "string" ? msg.componentId : null);
    else if (msg.type === "pl:bot") startBot(msg);
  });
}

// ── Live preview ─────────────────────────────────────────────────────────────
// A preview change is applied to the running game when the game registered a handler
// (onLiveUpdate) and every changed field can be applied live. Otherwise the page restarts.
// A field restarts when it is marked { restart: true } (values the game only reads at start, such
// as a level layout), when it is an isEnabled switch or the language, or when it is a non-image
// asset (sounds, spines, atlases, fonts and models are decoded once at start).
// Images are applied live: the component reloads its textures and renders again.

const live = { state: null, handler: null, listeners: new Set() };

/**
 * Registers the function that applies a new config to the running game:
 *   handler({ config, changed: [path, ...], assets: { assetId: dataUri } }) → true when applied
 */
export function onLiveUpdate(handler) {
  live.handler = handler;
}

/** The definition currently in use (changes when src/params.js is hot-reloaded). */
export function getDefinition() {
  return live.state && live.state.definition;
}

/** Called with the new definition after src/params.js is hot-reloaded (dev panel). */
export function onDefinitionChange(listener) {
  live.listeners.add(listener);
  return () => live.listeners.delete(listener);
}

function needsRestart(field) {
  return (
    field.restart === true ||
    field.type === "language" ||
    // Components build (or skip) their objects once, based on isEnabled.
    /(^|\.)isEnabled$/.test(field.path) ||
    // Spine/atlas pages and non-image assets are decoded once, at start.
    !!field.loader ||
    (ASSET_TYPES.includes(field.type) && field.type !== "image")
  );
}

function changedPaths(fields, before, after, beforeFields = fields) {
  const previous = new Map(beforeFields.map((f) => [f.path, f]));
  return fields
    .filter((f) => {
      const old = previous.get(f.path);
      const a = f.path in before ? before[f.path] : old && old.default;
      const b = f.path in after ? after[f.path] : f.default;
      return JSON.stringify(a) !== JSON.stringify(b);
    })
    .map((f) => f.path);
}

function applyLive({ definition, fields, values, assets, changed }) {
  const byPath = new Map(fields.map((f) => [f.path, f]));
  if (!live.handler || changed.some((p) => needsRestart(byPath.get(p)))) return false;
  const blocks = collectAssetBlocks();
  // An image that is neither in the page nor uploaded (e.g. a new file named in params.js) needs
  // the page to be rebuilt by the dev server.
  const missing = changed.some((p) => {
    const field = byPath.get(p);
    const id = p in values ? values[p] : field.default;
    return ASSET_TYPES.includes(field.type) && !blocks.has(id) && !(id in assets);
  });
  if (missing) return false;
  const entry = makeAssetEntry(blocks, assets);
  const { config } = resolveConfig(definition, values, entry);
  try {
    if (live.handler({ config, changed, assets }) === false) return false;
  } catch (e) {
    console.error("[playable] live update failed, restarting", e);
    return false;
  }
  live.state = { ...live.state, definition, fields, values, assets };
  return true;
}

/**
 * Applies preview overrides/assets (assets: { id: dataUri }) to the running game, or restarts the
 * page with them when they cannot be applied live. Used by the dev panel and pl:preview messages.
 */
export function updatePreview(overrides = {}, assets = {}) {
  if (!previewEnabled()) return;
  const state = live.state;
  if (!state) return applyPreview(overrides, assets);
  // Keep the values for the next reload without reloading now.
  window.name = PREVIEW_PREFIX + JSON.stringify({ overrides, assets });
  const { values } = sanitizeOverrides(state.fields, { ...state.embedded, ...overrides });
  const changed = changedPaths(state.fields, state.values, values);
  if (!changed.length) return;
  if (!applyLive({ ...state, values, assets, changed })) window.location.reload();
}

/** Hot-reload of src/params.js: re-resolves the config with the new defaults. */
export function updateDefinition(definition) {
  const state = live.state;
  if (!previewEnabled() || !state) return window.location.reload();
  const fields = collectFields(definition);
  const paths = (list) =>
    list
      .map((f) => f.path)
      .sort()
      .join("\n");
  // Added/removed fields change the manifest and the embedded asset blocks: restart.
  if (paths(fields) !== paths(state.fields)) return window.location.reload();
  const { values } = sanitizeOverrides(fields, { ...state.embedded, ...(readPreviewState() || {}).overrides });
  const changed = changedPaths(fields, state.values, values, state.fields);
  if (changed.length && !applyLive({ ...state, definition, fields, values, changed })) return window.location.reload();
  live.state = { ...live.state, definition, fields };
  live.listeners.forEach((listener) => listener(definition));
}

// ── Select in preview ────────────────────────────────────────────────────────
// The Studio's "Select" mode: a transparent layer over the game takes the pointer (so the game does
// not react), outlines the component under it and reports clicks. The game provides the lookup:
//   registerInspector({ pick(clientX, clientY) → componentId[], bounds(componentId) → rect | null })
// (lib/playinFramework3D/modules/sceneInspector.js builds one from the component map).
// Messages to the parent: pl:inspectable (the game supports it), pl:hover { componentId } and
//   pl:select { componentId, related: [{ componentId, reason }], assets: [{ path, frame }] }
// related: components that belong with the selection — "parent", "contains", "uses" (it holds a
// reference, e.g. a shared asset loader) and "below" (under the clicked point). assets: the image
// fields of what was clicked (all files of an atlas/spine), e.g. the gem atlas when a tile is clicked.

const inspect = { inspector: null, enabled: false, layer: null, box: null, hover: null, shown: null, frame: 0 };

function post(message) {
  if (window.parent && window.parent !== window && window.location.origin !== "null")
    window.parent.postMessage(message, window.location.origin);
}

/** Components that have fields in src/params.js ("components.<id>.…"), so a pick lands on something editable. */
function editable(ids) {
  const fields = (live.state && live.state.fields) || [];
  return ids.find((id) => fields.some((f) => f.path.startsWith(`components.${id}.`))) || null;
}

const pickIds = (result) => (Array.isArray(result) ? result : (result && result.ids) || []);

/** Asset fields showing the loaded images { key, frame } (key = field.key or the asset id in use). */
function assetFieldsFor(entries) {
  const state = live.state;
  if (!state || !entries || !entries.length) return [];
  const assetFields = state.fields.filter((f) => ASSET_TYPES.includes(f.type));
  const out = [];
  for (const { key, frame } of entries) {
    for (const field of assetFields) {
      const value = field.path in state.values ? state.values[field.path] : field.default;
      if ((field.key || value) !== key) continue;
      // An atlas / spine is several fields (png, json, atlas text): list them together.
      const slot = field.path.replace(/\.\d+$/, "");
      for (const f of assetFields) {
        if ((f.path === slot || f.path.startsWith(slot + ".")) && !out.some((a) => a.path === f.path))
          out.push({ path: f.path, frame: frame || null });
      }
    }
  }
  return out;
}

function selection(result) {
  const id = editable(pickIds(result));
  if (!id) return null;
  const related = [];
  const add = (componentId, reason) => {
    const target = componentId && editable([componentId]);
    if (target && target !== id && !related.some((r) => r.componentId === target))
      related.push({ componentId: target, reason });
  };
  const links = (inspect.inspector.related && inspect.inspector.related(id)) || [];
  links.forEach((link) => add(link.componentId, link.reason));
  ((result && result.stack) || []).forEach((componentId) => add(componentId, "below"));
  return { componentId: id, related, assets: assetFieldsFor(result && result.assets) };
}

function labelOf(id) {
  const fields = (live.state && live.state.fields) || [];
  const field = fields.find((f) => f.path.startsWith(`components.${id}.`));
  return (field && field.group) || id;
}

export function registerInspector(inspector) {
  if (!previewEnabled()) return;
  inspect.inspector = inspector;
  post({ type: "pl:inspectable" });
}

function ensureBox() {
  if (inspect.box) return inspect.box;
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:2px solid #d7192f;" +
    "background:rgba(215,25,47,.08);border-radius:3px;display:none;transition:all 60ms linear";
  const label = document.createElement("div");
  label.style.cssText =
    "position:absolute;left:-2px;bottom:100%;margin-bottom:2px;background:#d7192f;color:#fff;" +
    "font:600 11px/1.6 system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap";
  box.appendChild(label);
  document.body.appendChild(box);
  inspect.box = box;
  return box;
}

/** Keeps the outline on the shown component while it moves or animates. */
function drawBox() {
  cancelAnimationFrame(inspect.frame);
  const id = inspect.shown;
  const box = ensureBox();
  const rect = id && inspect.inspector && inspect.inspector.bounds(id);
  if (!rect) {
    box.style.display = "none";
  } else {
    Object.assign(box.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    const label = box.firstChild;
    label.textContent = labelOf(id);
    // Keep the label inside the screen for elements at the top edge.
    Object.assign(
      label.style,
      rect.top < 20 ? { bottom: "auto", top: "100%", marginTop: "2px" } : { bottom: "100%", top: "auto" }
    );
  }
  if (id) inspect.frame = requestAnimationFrame(drawBox);
}

function show(id) {
  if (inspect.shown === id) return;
  inspect.shown = id;
  drawBox();
}

/** Outline a component without select mode (the Studio hovers a field group). */
function highlight(id) {
  if (!inspect.inspector) return;
  show(id || (inspect.enabled ? inspect.hover : null));
}

function setInspecting(enabled) {
  if (!inspect.inspector || inspect.enabled === enabled) return;
  inspect.enabled = enabled;
  if (!enabled) {
    inspect.layer.remove();
    inspect.layer = null;
    inspect.hover = null;
    show(null);
    return;
  }
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;touch-action:none";
  let pending = null;
  const target = (e) => editable(pickIds(inspect.inspector.pick(e.clientX, e.clientY)));
  layer.addEventListener("pointermove", (e) => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      const id = target(e);
      if (id === inspect.hover) return;
      inspect.hover = id;
      show(id);
      post({ type: "pl:hover", componentId: id });
    });
  });
  layer.addEventListener("pointerleave", () => {
    inspect.hover = null;
    show(null);
    post({ type: "pl:hover", componentId: null });
  });
  layer.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const picked = selection(inspect.inspector.pick(e.clientX, e.clientY));
    if (picked) post({ type: "pl:select", ...picked });
  });
  // The game listens on window/document too: keep presses from reaching it.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"])
    layer.addEventListener(type, (e) => e.stopPropagation());
  document.body.appendChild(layer);
  inspect.layer = layer;
}

// ── Bot playtest ─────────────────────────────────────────────────────────────
// The Studio's "Playtest" plays the game by itself (in a hidden preview) to measure how hard a variant
// is and to catch errors after a new release. The game provides the rules:
//   registerBot({
//     status() → { state: "busy" | "ready" | "won" | "lost", movesLeft?, goalsLeft? }
//     moves()  → valid moves while "ready": [{ …anything play() needs, score? }] (higher score = better)
//     play(move)
//     setSpeed(x)  optional: run animations x times faster
//   })
// Messages: pl:bot-ready (the game supports it) · parent → pl:bot { strategy: "greedy" | "random",
// speed, seed, maxSteps, timeoutMs } · pl:bot-step { step, movesLeft, goalsLeft } ·
// pl:bot-result { outcome: "won" | "lost" | "stuck" | "timeout" | "error", steps, movesLeft,
// goalsLeft, errors: [message], ms }. One run per page load; the parent reloads for the next.

const bot = { adapter: null, running: false, errors: [] };

if (previewEnabled()) {
  // The kit's own problems (a missing asset, an invalid value) are logged as "[playable] …" errors.
  const consoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("[playable]")) bot.errors.push(args.map(String).join(" "));
    consoleError.apply(console, args);
  };
  window.addEventListener("error", (e) => bot.errors.push(String((e.error && e.error.message) || e.message)));
  window.addEventListener("unhandledrejection", (e) =>
    bot.errors.push(String((e.reason && e.reason.message) || e.reason))
  );
}

export function registerBot(adapter) {
  if (!previewEnabled()) return;
  bot.adapter = adapter;
  post({ type: "pl:bot-ready" });
}

function seededRandom(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startBot({
  mode = "difficulty",
  strategy = "greedy",
  speed = 4,
  seed = 1,
  maxSteps = 200,
  timeoutMs = 120000
} = {}) {
  const adapter = bot.adapter;
  if (!adapter || bot.running) return;
  bot.running = true;
  const random = seededRandom(Number(seed) || 1);
  const started = performance.now();
  let steps = 0;
  let stuckSince = 0;
  if (adapter.setSpeed) adapter.setSpeed(Math.max(1, Math.min(Number(speed) || 1, 20)));

  const finish = (outcome, status = {}) => {
    bot.running = false;
    clearInterval(timer);
    post({
      type: "pl:bot-result",
      outcome,
      steps,
      movesLeft: status.movesLeft ?? null,
      goalsLeft: status.goalsLeft ?? null,
      errors: bot.errors.slice(0, 20),
      ms: Math.round(performance.now() - started)
    });
  };

  const pick = (moves) => {
    if (strategy !== "random") {
      const best = Math.max(...moves.map((m) => m.score ?? 0));
      moves = moves.filter((m) => (m.score ?? 0) === best);
    }
    return moves[Math.floor(random() * moves.length)];
  };

  const tick = () => {
    let status;
    try {
      status = adapter.status() || {};
      if (bot.errors.length) return finish("error", status);
      if (status.state === "won" || status.state === "lost") return finish(status.state, status);
      if (performance.now() - started > timeoutMs) return finish("timeout", status);
      if (steps >= maxSteps && status.state === "ready")
        return finish(mode === "check" ? "checked" : "timeout", status);
      if (status.state !== "ready") {
        stuckSince = 0;
        return;
      }
      const moves = adapter.moves() || [];
      if (!moves.length) {
        stuckSince = stuckSince || performance.now();
        if (performance.now() - stuckSince > 4000) finish("stuck", status);
        return;
      }
      stuckSince = 0;
      adapter.play(pick(moves));
      steps++;
      post({
        type: "pl:bot-step",
        step: steps,
        movesLeft: status.movesLeft ?? null,
        goalsLeft: status.goalsLeft ?? null
      });
    } catch (e) {
      bot.errors.push(String(e && e.message ? e.message : e));
      finish("error", status);
    }
  };
  const timer = setInterval(tick, 60);
}
