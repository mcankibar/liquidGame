import _ from "lodash-es";
/**
 * Shared utilities for all asset loaders.
 */

/**
 * Derives a key from a file path: "path/to/myAsset.glb" → "myAsset"
 */
export function keyFromFile(filePath) {
  return filePath.split("/").pop().split(".")[0];
}

/**
 * Returns the loadable src string for an asset entry.
 *   { data }      → returns the data string directly (base64 / data-URI)
 *   { file }      → "./prefix/file"
 *   { assetPath } → "./assets/assetPath"
 *   otherwise     → null
 */
export function getSrc(asset, prefix) {
  if (_.has(asset, "data")) return asset.data;
  if (_.has(asset, "file")) return `${prefix}/${asset.file}`;
  if (_.has(asset, "assetPath")) return `./assets/${asset.assetPath}`;
  return null;
}

// A single request per asset and loader group. Every component tracks every dependency.
const requests = new WeakMap();

export function scheduleLoad(key, loadedMap, sentSet, toLoadSet, doLoad, onComplete) {
  if (toLoadSet.has(key)) return;
  toLoadSet.add(key);
  if (loadedMap.has(key)) {
    queueMicrotask(() => onComplete(key));
    return;
  }
  let group = requests.get(sentSet);
  if (!group) requests.set(sentSet, (group = new Map()));
  let request = group.get(key);
  if (!request) {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    request = { promise, resolve, reject, loadedMap };
    group.set(key, request);
    sentSet.add(key);
    queueMicrotask(() => {
      try {
        Promise.resolve(doLoad(key)).catch((error) => finishRequest(key, sentSet, error));
      } catch (error) {
        finishRequest(key, sentSet, error);
      }
    });
  }
  request.promise.then(
    () => onComplete(key),
    (error) => onComplete(key, error)
  );
}

function finishRequest(key, sentSet, error) {
  const group = requests.get(sentSet);
  const request = group?.get(key);
  if (!request) return false;
  group.delete(key);
  sentSet.delete(key);
  if (error || !request.loadedMap.has(key)) request.reject(error || new Error(`Asset failed to load: ${key}`));
  else request.resolve();
  return true;
}

export function assetLoadHandler(key, toLoadSet, sentSet, onComplete, error, onError) {
  // The actual loader settles the shared promise; subscribers finish their own pending set.
  if (finishRequest(key, sentSet, error)) return;
  toLoadSet.delete(key);
  if (error) {
    onError?.(error);
    return;
  }
  if (toLoadSet.size === 0) onComplete();
}

/**
 * Marks an asset-type load as complete and triggers the component's
 * overall completion check.
 */
export function markLoadComplete(component, flagProp, label) {
  if (component[flagProp]) return; // already complete, ignore double-fire
  component[flagProp] = true;
  if (_.isNil(component.componentId)) {
    throw { message: "this component's componentId is nil", component };
  }
  console.debug(`[LOAD COMPLETE] ${component.componentId} : ${label} ✓`);
  component.checkAllLoadsCompleted();
}
