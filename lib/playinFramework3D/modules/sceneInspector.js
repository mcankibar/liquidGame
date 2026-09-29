// Finds which component is under a point of the canvas and where a component is on screen.
// Used by the Studio's "select in preview" mode (playable/kit/runtime.js → registerInspector).
//
// Ownership is found by looking at what each component holds: its gameObjectsMap and its own
// properties (a few levels into arrays / maps / plain objects), so components need no extra code.
// A hit object belongs to the nearest ancestor that some component holds; when several components
// hold it, the most nested one (child component) wins.
//
// A pick also says what else is relevant to that spot, so the editor can list it together:
//   assets   the loaded images the hit object shows ({ key, frame } — key as in the loaders' maps,
//            e.g. "gems_PNG" + frame "redGem.png" for an atlas frame)
//   stack    components under the picked one at that point
// and related(id) lists components linked to a component (parent, children, references).
import * as THREE from "three";

// Shared references every component carries; they are not "its" objects.
const SKIP_KEYS = new Set([
  "scene",
  "camera",
  "parent",
  "helper",
  "eventBus",
  "playable",
  "renderer",
  "components",
  "game",
  "sharedAssetLoader",
  "log",
  "atlasLoaderJSONMap"
]);
// Asset caches (loadedGltfFilesInGameMap, loadedTexturesInGameMap, …) are shared by all components.
const isCacheKey = (key) => SKIP_KEYS.has(key) || /^(loaded|selected)/.test(key);
// An object held by more components than this (that aren't parent/child) is a shared resource.
const MAX_SHARED = 3;
const MAX_DEPTH = 3;

const isComponent = (v) => typeof v.componentId === "string";
const isScanned = (v) =>
  Array.isArray(v) || v instanceof Map || v instanceof Set || Object.getPrototypeOf(v) === Object.prototype;

function collectObjects(component) {
  const found = new Set();
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.isObject3D) {
      if (!value.isScene && !value.isCamera && !value.isLight) found.add(value);
      return;
    }
    if (isComponent(value) || depth > MAX_DEPTH) return;
    if (value.scene?.isObject3D && !value.scene.isScene) found.add(value.scene); // GLTF result
    if (value.scene?.isScene && value.scene !== component.scene) found.add(value.scene); // GLTF scene root
    if (!isScanned(value)) return;
    const items = value instanceof Map || value instanceof Set ? value.values() : Object.values(value);
    for (const item of items) visit(item, depth + 1);
  };
  component.gameObjectsMap?.forEach((v) => visit(v, 1));
  for (const [key, value] of Object.entries(component)) if (!isCacheKey(key)) visit(value, 1);
  return found;
}

/** Map<Texture | Source, { key, frame }> from the loaders' caches (loadedTexturesInGameMap, loadedAtlasTexturesMap…). */
function textureIndex(components) {
  const index = new Map();
  const add = (texture, entry) => {
    if (!index.has(texture)) index.set(texture, entry);
    if (texture.source && !index.has(texture.source)) index.set(texture.source, entry);
  };
  const seen = new Set(); // most caches are shared by every component
  for (const component of components.values()) {
    for (const [name, cache] of Object.entries(component)) {
      if (!/^loaded/.test(name) || !(cache instanceof Map) || seen.has(cache)) continue;
      seen.add(cache);
      for (const [key, value] of cache) {
        if (value?.isTexture) add(value, { key: String(key), frame: null });
        else if (value instanceof Map)
          for (const [frame, texture] of value)
            if (texture?.isTexture) add(texture, { key: String(key), frame: String(frame) });
      }
    }
  }
  return index;
}

const TEXTURE_SLOTS = ["map", "alphaMap", "emissiveMap"];

// Pixels of the images that were hit, to ignore clicks on transparent parts of a sprite (a header
// image with empty margins must not cover the button next to it).
const pixelCache = new WeakMap();
function pixels(image) {
  if (pixelCache.has(image)) return pixelCache.get(image);
  let data = null;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width && height && typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      data = { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
    } catch (e) {
      data = null; // not drawable (data / compressed textures) or cross-origin: treat as opaque
    }
  }
  pixelCache.set(image, data);
  return data;
}

// Stencil masks: an invisible mesh (colorWrite off) writes a stencil value, and objects with an
// Equal/NotEqual stencil test only show where that value is (e.g. a bird clipped to a round frame).
// Their geometry reaches far outside the visible part, so a hit only counts when the mask agrees.
const materialOf = (object) => [].concat(object.material || [])[0];
const isMask = (m) => !!m && m.colorWrite === false && m.stencilWrite === true;

function passesStencil(hit, maskRefs) {
  const m = materialOf(hit.object);
  if (!m || !m.stencilWrite) return true;
  if (m.stencilFunc === THREE.EqualStencilFunc) return maskRefs.has(m.stencilRef);
  if (m.stencilFunc === THREE.NotEqualStencilFunc) return !maskRefs.has(m.stencilRef);
  return true;
}

const uv = new THREE.Vector2();
/** Alpha (0..1) of the textured object at the hit point; 1 when it can't be told. */
function alphaAt(hit) {
  const material = [].concat(hit.object.material || []).find((m) => m && m.map);
  const texture = material && material.map;
  if (!texture || !hit.uv || !texture.image) return 1;
  const data = pixels(texture.image);
  if (!data) return 1;
  uv.copy(hit.uv);
  texture.updateMatrix();
  texture.transformUv(uv);
  const x = Math.min(data.width - 1, Math.max(0, Math.floor(uv.x * data.width)));
  const y = Math.min(data.height - 1, Math.max(0, Math.floor(uv.y * data.height)));
  return (data.rgba[(y * data.width + x) * 4 + 3] / 255) * (material.opacity ?? 1);
}

function nesting(component) {
  let n = 0;
  for (let c = component.parent; c && n < 20; c = c.parent) n++;
  return n;
}

const visibleMaterial = (m) => !m || (m.visible !== false && !(m.transparent && m.opacity < 0.05));

/**
 * @param components  Map<componentId, component>
 * @param canvas      the renderer's canvas
 * @param views       () => [{ scene, camera }] from top-most (UI) to bottom-most
 */
export function createSceneInspector({ components, canvas, views }) {
  const raycaster = new THREE.Raycaster();
  let cache = { at: 0, owners: null, textures: null };

  /** Map<Object3D, componentId[]> (most nested component first); rebuilt at most twice a second. */
  function owners() {
    if (cache.owners && performance.now() - cache.at < 500) return cache.owners;
    const map = new Map();
    const ranked = [...components].sort(([, a], [, b]) => nesting(b) - nesting(a));
    for (const [id, component] of ranked) {
      for (const object of collectObjects(component)) {
        if (!map.has(object)) map.set(object, []);
        map.get(object).push(id);
      }
    }
    for (const [object, ids] of map) if (ids.length > MAX_SHARED) map.delete(object);
    cache = { at: performance.now(), owners: map, textures: textureIndex(components) };
    return map;
  }

  /** The loaded images an object shows. */
  function assetsOf(object) {
    owners();
    const found = [];
    for (const material of [].concat(object.material || [])) {
      for (const slot of TEXTURE_SLOTS) {
        const texture = material[slot];
        const entry = texture && (cache.textures.get(texture) || cache.textures.get(texture.source));
        if (entry && !found.some((e) => e.key === entry.key && e.frame === entry.frame)) found.push(entry);
      }
    }
    return found;
  }

  /**
   * Components linked to one: its parent ("parent"), components it holds a reference to ("uses",
   * e.g. a shared asset loader) and components whose parent it is ("contains").
   */
  function related(componentId) {
    const component = components.get(componentId);
    if (!component) return [];
    const out = [];
    const add = (other, reason) => {
      const id = other?.componentId;
      if (id && id !== componentId && components.get(id) === other && !out.some((r) => r.componentId === id))
        out.push({ componentId: id, reason });
    };
    add(component.parent, "parent");
    for (const [key, value] of Object.entries(component)) {
      if (key === "parent" || !value || typeof value !== "object") continue;
      if (isComponent(value)) add(value, "uses");
      else if (Array.isArray(value) || value instanceof Map)
        for (const item of value.values()) if (item && typeof item === "object" && isComponent(item)) add(item, "uses");
    }
    for (const other of components.values()) if (other.parent === component) add(other, "contains");
    return out;
  }

  /** Component ids that hold `object` or one of its ancestors, most specific first. */
  function ownersOf(object) {
    const map = owners();
    const ids = [];
    for (let o = object; o; o = o.parent) for (const id of map.get(o) || []) if (!ids.includes(id)) ids.push(id);
    // Parents of the picked components come next, so a caller can fall back to them.
    for (const id of [...ids]) {
      for (let c = components.get(id)?.parent; c; c = c.parent) {
        if (c.componentId && !ids.includes(c.componentId)) ids.push(c.componentId);
      }
    }
    return ids;
  }

  function toNdc(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  const toCamera = new THREE.Vector3();
  /**
   * Hits in the order they appear on screen, top first: nearer, then transparent (drawn after
   * opaque), then higher renderOrder, then added later (drawn later at equal depth).
   */
  function onScreenOrder(hits, camera) {
    const depth = (hit) => toCamera.copy(hit.point).applyMatrix4(camera.matrixWorldInverse).z;
    const transparent = (o) => [].concat(o.material || []).some((m) => m.transparent);
    const maskRefs = new Set(
      hits.filter((h) => isMask(materialOf(h.object))).map((h) => materialOf(h.object).stencilRef)
    );
    return hits
      .filter((hit) => materialOf(hit.object)?.colorWrite !== false)
      .filter((hit) => passesStencil(hit, maskRefs))
      .filter((hit) => alphaAt(hit) > 0.1)
      .map((hit) => ({ hit, depth: Math.round(depth(hit) * 1000) }))
      .sort(
        (a, b) =>
          b.depth - a.depth ||
          transparent(b.hit.object) - transparent(a.hit.object) ||
          b.hit.object.renderOrder - a.hit.object.renderOrder ||
          b.hit.object.id - a.hit.object.id
      )
      .map(({ hit }) => hit);
  }

  /**
   * @returns {{ ids: string[], assets: {key, frame}[], stack: string[] }}
   *   ids     components of the top-most owned object (most specific first, then their parents)
   *   assets  the images that object shows
   *   stack   components of the other objects under the point, top first
   */
  function pick(clientX, clientY) {
    const ndc = toNdc(clientX, clientY);
    const result = { ids: [], assets: [], stack: [] };
    for (const { scene, camera } of views()) {
      if (!scene || !camera) continue;
      raycaster.setFromCamera(ndc, camera);
      const hits = [];
      scene.traverseVisible((object) => {
        if (object === scene || object.isCamera || object.isLight) return;
        if (!visibleMaterial(object.material)) return;
        try {
          object.raycast(raycaster, hits);
        } catch (e) {
          // Some custom objects (particle batches, spine meshes) can't be raycast; ignore them.
        }
      });
      for (const hit of onScreenOrder(hits, camera)) {
        const ids = ownersOf(hit.object);
        if (!ids.length) continue;
        if (!result.ids.length) {
          result.ids = ids;
          result.assets = assetsOf(hit.object);
        } else if (!result.ids.includes(ids[0]) && !result.stack.includes(ids[0])) {
          result.stack.push(ids[0]);
        }
      }
    }
    return result;
  }

  function cameraFor(object) {
    let root = object;
    while (root.parent) root = root.parent;
    return views().find((v) => v.scene === root)?.camera;
  }

  const corner = new THREE.Vector3();
  const box = new THREE.Box3();

  /** Screen rectangle (client px) of what the component shows, or null when nothing is visible. */
  function bounds(componentId) {
    const map = owners();
    const roots = [...map].filter(([, ids]) => ids.includes(componentId)).map(([o]) => o);
    const r = canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const root of roots) {
      if (!isShown(root)) continue;
      const camera = cameraFor(root);
      if (!camera) continue;
      root.traverseVisible((object) => {
        const geometry = object.geometry;
        const m = materialOf(object);
        if (!geometry || !visibleMaterial(object.material)) return;
        // A masked object shows only inside its mask: measure the mask (it is drawn, just not in colour).
        if (m && m.stencilWrite && !isMask(m) && m.stencilFunc !== THREE.AlwaysStencilFunc) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
        for (let i = 0; i < 8; i++) {
          corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
          corner.project(camera);
          if (corner.z > 1) continue; // behind the camera
          const x = r.left + ((corner.x + 1) / 2) * r.width;
          const y = r.top + ((1 - corner.y) / 2) * r.height;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      });
    }
    if (!(maxX > minX && maxY > minY)) return null;
    // Clip to the canvas: backgrounds and 3D scenes reach far past the screen.
    const left = Math.max(r.left, minX);
    const top = Math.max(r.top, minY);
    const right = Math.min(r.right, maxX);
    const bottom = Math.min(r.bottom, maxY);
    if (right <= left || bottom <= top) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  function isShown(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  return { pick, bounds, related };
}
