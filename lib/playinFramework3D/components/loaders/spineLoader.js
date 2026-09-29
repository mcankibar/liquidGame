import _ from "lodash-es";
import * as THREE from "three";
import * as spine from "@esotericsoftware/spine-threejs";
import { unzipSync } from "fflate";
import { markLoadComplete } from "./loaderUtils";

export function loadSpines(c) {
  const selectedSpines = c.selectedSpines;

  // Early-return if everything already loaded
  const allLoaded = Object.keys(selectedSpines).every((name) => c.loadedSpineDataMap.has(name));
  if (allLoaded) {
    spineLoadComplete(c);
    return;
  }

  Object.entries(selectedSpines).forEach(([spineName, spineFiles]) => {
    if (c.loadedSpineDataMap.has(spineName)) {
      spineLoadHandler(c, spineName);
      return;
    }

    const imageEntry = _.find(spineFiles, (f) => f.variant === "image");
    const jsonEntry = _.find(spineFiles, (f) => f.variant.toUpperCase() === "JSON");
    const atlasEntry = _.find(spineFiles, (f) => f.variant === "atlasTxt");

    if (!imageEntry || !jsonEntry || !atlasEntry) {
      console.error("Spine entries incomplete for", spineName, spineFiles);
      return;
    }

    c.spinesToLoad.add(spineName);

    Promise.all([
      _loadAtlasText(atlasEntry, spineName),
      _loadJsonData(jsonEntry, spineName),
      _loadTexture(imageEntry, spineName)
    ])
      .then(([atlasText, jsonData, texture]) => {
        const atlas = new spine.TextureAtlas(atlasText);
        // spine-core 4.2: set textures explicitly after construction
        for (const page of atlas.pages) {
          page.setTexture(new spine.ThreeJsTexture(texture.image, page.pma));
        }
        const skeletonData = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(jsonData);

        c.loadedSpineDataMap.set(spineName, { skeletonData, atlas, texture });
        spineLoadHandler(c, spineName);
      })
      .catch((e) => console.error(`Spine load error for '${spineName}':`, e));
  });
}

function _loadAtlasText(entry, spineName) {
  if (_.has(entry, "data") && typeof entry.data === "string") return Promise.resolve(entry.data);
  if (_.has(entry, "assetPath")) return fetch("./assets/" + entry.assetPath).then((r) => r.text());
  return Promise.reject(new Error("No atlas data/assetPath for " + spineName));
}

function _extractJsonFromBase64Zip(dataUri) {
  try {
    const base64Body = dataUri.split(",")[1];
    const zipBytes = Uint8Array.from(atob(base64Body), (c) => c.charCodeAt(0));
    const zipContents = unzipSync(zipBytes);
    const jsonFileName = Object.keys(zipContents).find((name) => name.endsWith(".json"));
    if (!jsonFileName) return null;
    const jsonText = new TextDecoder().decode(zipContents[jsonFileName]);
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("_extractJsonFromBase64Zip: failed", e);
    return null;
  }
}

function _isBase64Zip(data) {
  return typeof data === "string" && data.startsWith("data:application/zip");
}

function _loadJsonData(entry, spineName) {
  if (_.has(entry, "data")) {
    if (_isBase64Zip(entry.data)) {
      const json = _extractJsonFromBase64Zip(entry.data);
      if (json) return Promise.resolve(json);
      return Promise.reject(new Error("Failed to extract JSON from zip for " + spineName));
    }
    if (typeof entry.data === "object") return Promise.resolve(entry.data);
  }
  if (_.has(entry, "assetPath")) {
    if (entry.assetPath.endsWith(".zip")) {
      return fetch("./assets/" + entry.assetPath)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const zipContents = unzipSync(new Uint8Array(buf));
          const jsonFileName = Object.keys(zipContents).find((name) => name.endsWith(".json"));
          if (!jsonFileName) throw new Error("No .json found inside zip for " + spineName);
          return JSON.parse(new TextDecoder().decode(zipContents[jsonFileName]));
        });
    }
    return fetch("./assets/" + entry.assetPath).then((r) => r.json());
  }
  return Promise.reject(new Error("No json data/assetPath for " + spineName));
}

function _loadTexture(entry, spineName) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = (err) => reject(err);

    if (_.has(entry, "data")) img.src = entry.data;
    else if (_.has(entry, "assetPath")) img.src = "./assets/" + entry.assetPath;
    else reject(new Error("No image data/assetPath for " + spineName));
  });
}

export function spineLoadHandler(c, spineName) {
  c.spinesToLoad.delete(spineName);
  if (c.spinesToLoad.size === 0) {
    spineLoadComplete(c);
  }
}

export function spineLoadComplete(c) {
  markLoadComplete(c, "isSpineLoadComplete", "spines");
}
