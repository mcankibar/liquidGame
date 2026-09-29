import _ from "lodash-es";
import * as THREE from "three";
import { markLoadComplete } from "./loaderUtils";

export function loadAtlases(c) {
  const selectedAtlases = c.selectedAtlases;

  Object.values(selectedAtlases).forEach((atlas) => {
    const images = _.filter(atlas, (o) => o.variant === "image");
    const jsonArray = _.filter(atlas, (o) => o.variant.toUpperCase() === "JSON");

    images.forEach((image, index) => {
      // Skip only if this key is already in-flight (concurrent load guard)
      if (c.atlassesToLoad.has(image.key)) return;

      // Remove stale entry so atlas reloads are detected
      c.loadedAtlasTexturesMap.delete(image.key);

      c.atlassesToLoad.add(image.key);
      const imgElement = new Image();
      const jsonEntry = jsonArray[index];

      imgElement.onload = () => {
        if (jsonEntry && jsonEntry.JSON && jsonEntry.JSON.frames) {
          _processAtlasImage(c, image.key, imgElement, jsonEntry.JSON);
        } else if (jsonEntry && _.has(jsonEntry, "assetPath")) {
          fetch("./assets/" + jsonEntry.assetPath)
            .then((r) => r.json())
            .then((jsonData) => _processAtlasImage(c, image.key, imgElement, jsonData))
            .catch((err) => console.error("Failed to load atlas JSON:", jsonEntry.assetPath, err));
        } else if (jsonEntry && _.has(jsonEntry, "file")) {
          fetch("./atlases/" + jsonEntry.file)
            .then((r) => r.json())
            .then((jsonData) => _processAtlasImage(c, image.key, imgElement, jsonData))
            .catch((err) => console.error("Failed to load atlas JSON:", jsonEntry.file, err));
        } else {
          console.error("No JSON data or path for atlas:", image.key, jsonEntry);
        }
      };

      if (_.has(image, "data")) imgElement.src = image.data;
      else if (_.has(image, "assetPath")) imgElement.src = "./assets/" + image.assetPath;
      else if (_.has(image, "file")) imgElement.src = "./atlases/" + image.file;
    });
  });
}

function _processAtlasImage(c, key, imgElement, jsonData) {
  if (!jsonData || !jsonData.frames) {
    console.error("Invalid JSON data for atlas:", key, jsonData);
    atlasLoadHandler(c, key);
    return;
  }

  // Draw the full atlas onto a canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = imgElement.width;
  canvas.height = imgElement.height;
  ctx.drawImage(imgElement, 0, 0);

  // Slice each frame into its own CanvasTexture
  const texturesByFrame = new Map();
  Object.entries(jsonData.frames).forEach(([frameName, frameData]) => {
    const { x, y, w, h } = frameData.frame;
    const frameCanvas = document.createElement("canvas");
    const frameCtx = frameCanvas.getContext("2d");
    frameCanvas.width = w;
    frameCanvas.height = h;
    frameCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

    const texture = new THREE.CanvasTexture(frameCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texturesByFrame.set(frameName, texture);
  });

  c.loadedAtlasTexturesMap.set(key, texturesByFrame);
  atlasLoadHandler(c, key);
}

export function atlasLoadHandler(c, key) {
  c.atlassesToLoad.delete(key);
  if (c.atlassesToLoad.size === 0) {
    atlasLoadComplete(c);
  }
}

export function atlasLoadComplete(c) {
  markLoadComplete(c, "isAtlasLoadComplete", "atlases");
}
