import _ from "lodash-es";
import { keyFromFile, scheduleLoad, assetLoadHandler, markLoadComplete, getSrc } from "./loaderUtils";
import { extractGlbFromZip } from "../../modules/extractGlbFromZip";

export function loadGltfs(c) {
  console.debug(`[LOADER] ${c.componentId} loadGltfs start`, Object.keys(c.selectedGltfs));
  const selectedGltfs = c.selectedGltfs;

  // Assign keys for file-based entries upfront
  Object.values(selectedGltfs).forEach((gltfs) => {
    gltfs.forEach((gltf) => {
      if (_.has(gltf, "file") && !gltf.key) {
        gltf.key = keyFromFile(gltf.file);
      }
    });
  });

  // Early-return if everything already loaded
  const allLoaded = Object.values(selectedGltfs).every((gltfs) =>
    gltfs.every((gltf) => c.loadedGltfFilesInGameMap.has(gltf.key))
  );
  if (allLoaded) {
    gltfLoadComplete(c);
    return;
  }

  Object.values(selectedGltfs).forEach((gltfs) => {
    gltfs.forEach((gltf) => {
      scheduleLoad(
        gltf.key,
        c.loadedGltfFilesInGameMap,
        c.gltfsSentToLoadingManager,
        c.gltfsToLoad,
        () => _parseGltf(c, gltf),
        (key, error) => gltfLoadHandler(c, key, error)
      );
    });
  });
}

async function _parseGltf(c, gltf) {
  const key = gltf.key;
  try {
    let buffer;

    if (_.has(gltf, "zipData")) {
      const arrayBuffer = c.base64ToArrayBuffer(gltf.zipData);
      buffer = await extractGlbFromZip(arrayBuffer);
      if (!buffer) {
        console.error("No .glb file found in zip", key);
        gltfLoadHandler(c, key); // unblock queue even on failure
        return;
      }
    } else if (_.has(gltf, "data")) {
      buffer = c.base64ToArrayBuffer(gltf.data);
    } else if (_.has(gltf, "file")) {
      _loadFromUrl(c, key, `./glbs/${gltf.file}`);
      return;
    } else if (_.has(gltf, "assetPath")) {
      // Path mode (TikTok): assets sit on disk next to index.html instead of
      // being inlined, so zips have to be fetched before extraction.
      const src = getSrc(gltf, "./glbs");
      if (!src.toLowerCase().endsWith(".zip")) {
        _loadFromUrl(c, key, src);
        return;
      }
      const response = await fetch(src);
      if (!response.ok) throw new Error(`gltf '${key}' could not be fetched: ${src}`);
      buffer = await extractGlbFromZip(await response.arrayBuffer());
      if (!buffer) {
        console.error("No .glb file found in zip", key);
        gltfLoadHandler(c, key); // unblock queue even on failure
        return;
      }
    } else {
      throw new Error(`gltf '${key}' has no zipData/data/file`);
    }

    // Parse binary buffer (zip or data)
    c.gLTFLoader.parse(
      buffer,
      "",
      (result) => {
        c.loadedGltfFilesInGameMap.set(key, result);
        gltfLoadHandler(c, key);
      },
      (err) => {
        console.error("gltf parse error", key, err);
        gltfLoadHandler(c, key); // unblock queue even on failure
      }
    );
  } catch (e) {
    console.error("gltf load exception", key, e);
    gltfLoadHandler(c, key); // unblock queue even on failure
  }
}

function _loadFromUrl(c, key, url) {
  c.gLTFLoader.load(
    url,
    (object) => {
      c.loadedGltfFilesInGameMap.set(key, object);
      gltfLoadHandler(c, key);
    },
    undefined,
    (err) => {
      console.error("gltf could not be loaded", key, err);
      gltfLoadHandler(c, key); // unblock queue even on failure
    }
  );
}

export function gltfLoadHandler(c, key, error) {
  assetLoadHandler(
    key,
    c.gltfsToLoad,
    c.gltfsSentToLoadingManager,
    () => {
      if (!c.loadError) gltfLoadComplete(c);
    },
    error,
    (err) => {
      c.loadError = err;
      c.helper?.onLoadError?.(err);
    }
  );
}

export function gltfLoadComplete(c) {
  markLoadComplete(c, "isGltfsLoadComplete", "gltfs");
}
