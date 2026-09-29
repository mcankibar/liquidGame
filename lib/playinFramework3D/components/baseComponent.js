import _ from "lodash-es";
import { loadTextures } from "./loaders/textureLoader";
import { loadSounds } from "./loaders/soundLoader";
import { loadObjs } from "./loaders/objLoader";
import { loadGltfs } from "./loaders/gltfLoader";
import { loadAtlases } from "./loaders/atlasLoader";
import { loadSpines } from "./loaders/spineLoader";

export class BaseComponent {
  constructor(props) {
    this.log = [];
    this.isVisible = true;
    this.gameObjectsMap = new Map();

    // Per-type tracking sets (in-flight keys)
    this.texturesToLoad = new Set();
    this.soundsToLoad = new Set();
    this.objsToLoad = new Set();
    this.gltfsToLoad = new Set();
    this.atlassesToLoad = new Set();
    this.spinesToLoad = new Set();

    // Loaded-data maps (populated by loaders)
    this.atlasLoaderJSONMap = new Map();
    this.loadedAtlasTexturesMap = new Map();
    this.loadedSpineDataMap = new Map();

    this.update(props);

    // Completion flags — set false when loading starts, true when done
    this.isTextureLoadComplete = true;
    this.isSoundLoadComplete = true;
    this.isObjLoadComplete = true;
    this.isGltfsLoadComplete = true;
    this.isCustomFontLoadComplete = true;
    this.isAtlasLoadComplete = true;
    this.isSpineLoadComplete = true;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  load() {
    if (!_.has(this, "scene")) {
      console.warn({ message: "component has no scene", component: this });
    }
    if (_.has(this, "parentId")) {
      if (!_.hasIn(this, "helper.components")) {
        throw { message: "game doesn't have this component", component: this };
      }
      this.parent = this.helper.components.get(this.parentId);
    }

    // Each entry: presence flag → completion flag → loader
    const assetTypes = [
      { key: "selectedImages", flag: "isTextureLoadComplete", loader: () => loadTextures(this) },
      { key: "selectedSounds", flag: "isSoundLoadComplete", loader: () => loadSounds(this) },
      { key: "selectedObjs", flag: "isObjLoadComplete", loader: () => loadObjs(this) },
      { key: "selectedGltfs", flag: "isGltfsLoadComplete", loader: () => loadGltfs(this) },
      { key: "selectedAtlases", flag: "isAtlasLoadComplete", loader: () => loadAtlases(this) },
      { key: "selectedSpines", flag: "isSpineLoadComplete", loader: () => loadSpines(this) }
    ];

    // Pass 1: lower ALL flags before any loader runs.
    // This prevents an early-returning loader from seeing other flags as "true"
    // and prematurely firing onReady() while the forEach is still running.
    let hasAssets = false;
    assetTypes.forEach(({ key, flag }) => {
      if (_.has(this, key)) {
        this[flag] = false;
        hasAssets = true;
      }
    });
    if (_.has(this, "fonts")) {
      this.isCustomFontLoadComplete = false;
      hasAssets = true;
    }

    // Pass 2: start loaders (all flags are already false at this point)
    assetTypes.forEach(({ key, loader }) => {
      if (_.has(this, key)) loader();
    });

    // No assets at all → component is immediately ready
    if (!hasAssets) this.checkAllLoadsCompleted();
  }

  checkAllLoadsCompleted() {
    const flags = {
      texture: this.isTextureLoadComplete,
      sound: this.isSoundLoadComplete,
      gltf: this.isGltfsLoadComplete,
      obj: this.isObjLoadComplete,
      font: this.isCustomFontLoadComplete,
      atlas: this.isAtlasLoadComplete,
      spine: this.isSpineLoadComplete
    };
    const pending = Object.entries(flags)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    console.debug(`[${this.componentId}] checkAllLoadsCompleted — pending:`, pending.length ? pending : "none");
    if (pending.length === 0) {
      this.onReady();
    }
  }

  // ── Props / Validation ──────────────────────────────────────────────────────

  update(props) {
    Object.entries(props).forEach(([key, value]) => {
      _.set(this, key, value);
      this.log.push({ key, value, timestamp: new Date() });
    });
  }

  requireParameters(props, parameters) {
    const missed = parameters.filter((p) => !_.has(props, p));
    if (missed.length > 0) {
      throw { message: "missing parameters", object: JSON.stringify(missed) };
    }
  }

  // ── Setters ─────────────────────────────────────────────────────────────────

  set Scene(value) {
    this.scene = value;
  }

  set IsVisible(value) {
    this.isVisible = value;
    if (!_.isNil(this.scene)) {
      this.helper.components.forEach((component) => {
        if (component.parentId === this.componentId) {
          component.IsVisible = value;
          component.render();
        }
      });
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  base64ToArrayBuffer(base64) {
    if (base64.includes(",")) base64 = base64.split(",")[1];
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  getOrientation() {
    return document.body.clientHeight > document.body.clientWidth ? "portrait" : "landscape";
  }

  render() {}

  // ── Atlas helpers ────────────────────────────────────────────────────────────

  getAtlasTexture(atlasKey, frameKey) {
    const frames = this.loadedAtlasTexturesMap.get(atlasKey);
    if (!frames) {
      console.warn(`Atlas '${atlasKey}' not found`);
      return null;
    }
    const texture = frames.get(frameKey);
    if (!texture) {
      console.warn(`Frame '${frameKey}' not found in atlas '${atlasKey}'`);
      return null;
    }
    return texture;
  }

  getAtlasFrameNumber(atlasKey) {
    const frames = this.loadedAtlasTexturesMap.get(atlasKey);
    if (!frames) {
      console.warn(`Atlas '${atlasKey}' not found`);
      return null;
    }
    return frames.size;
  }

  // ── Spine helper ─────────────────────────────────────────────────────────────

  getSpineData(spineName) {
    const data = this.loadedSpineDataMap.get(spineName);
    if (!data) {
      console.warn(`Spine '${spineName}' not found`);
      return null;
    }
    return data;
  }
}
