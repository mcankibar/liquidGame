import _ from "lodash-es";
import * as THREE from "three";
import { keyFromFile, getSrc, scheduleLoad, assetLoadHandler, markLoadComplete } from "./loaderUtils";

export function loadTextures(c) {
  console.debug(`[LOADER] ${c.componentId} loadTextures start`);
  const selectedImages = c.selectedImages;

  // Assign keys for file-based entries upfront
  Object.values(selectedImages).forEach((images) => {
    images.forEach((image) => {
      if (_.has(image, "file") && !image.key) {
        image.key = keyFromFile(image.file);
      }
    });
  });

  // Early-return if everything already in the loaded map
  const allLoaded = Object.values(selectedImages).every((images) =>
    images.every((img) => c.loadedTexturesInGameMap.has(img.key))
  );
  if (allLoaded) {
    textureLoadComplete(c);
    return;
  }

  Object.values(selectedImages).forEach((images) => {
    images.forEach((image) => {
      const src = getSrc(image, "./images");
      if (!src) throw { message: "texture has no data/file/assetPath", object: c };

      scheduleLoad(
        image.key,
        c.loadedTexturesInGameMap,
        c.texturesSentToLoadingManager,
        c.texturesToLoad,
        () => {
          c.textureLoader.load(
            src,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              c.loadedTexturesInGameMap.set(image.key, texture);
              textureLoadHandler(c, image.key);
            },
            undefined,
            (err) => {
              console.error("texture could not be loaded", image.key, err);
              textureLoadHandler(c, image.key); // unblock queue
            }
          );
        },
        (key, error) => textureLoadHandler(c, key, error)
      );
    });
  });
}

export function textureLoadHandler(c, key, error) {
  assetLoadHandler(
    key,
    c.texturesToLoad,
    c.texturesSentToLoadingManager,
    () => {
      if (!c.loadError) textureLoadComplete(c);
    },
    error,
    (err) => {
      c.loadError = err;
      c.helper?.onLoadError?.(err);
    }
  );
}

export function textureLoadComplete(c) {
  markLoadComplete(c, "isTextureLoadComplete", "textures");
}
