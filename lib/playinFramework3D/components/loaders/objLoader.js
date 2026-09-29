import _ from "lodash-es";
import { keyFromFile, getSrc, scheduleLoad, assetLoadHandler, markLoadComplete } from "./loaderUtils";

export function loadObjs(c) {
  const selectedObjs = c.selectedObjs;

  // Assign keys for file-based entries upfront
  Object.values(selectedObjs).forEach((objs) => {
    objs.forEach((obj) => {
      if (_.has(obj, "file") && !obj.key) {
        obj.key = keyFromFile(obj.file);
      }
    });
  });

  // Early-return if everything already loaded
  const allLoaded = Object.values(selectedObjs).every((objs) =>
    objs.every((obj) => c.loadedObjFilesInGameMap.has(obj.key))
  );
  if (allLoaded) {
    objLoadComplete(c);
    return;
  }

  Object.values(selectedObjs).forEach((objs) => {
    objs.forEach((obj) => {
      const src = getSrc(obj, "./objs");
      if (!src) throw { message: "obj has no data/file/assetPath", object: c };

      scheduleLoad(
        obj.key,
        c.loadedObjFilesInGameMap,
        c.objsSentToLoadingManager,
        c.objsToLoad,
        () => {
          c.oBJLoader.load(
            src,
            (object) => {
              c.loadedObjFilesInGameMap.set(obj.key, object);
              objLoadHandler(c, obj.key);
            },
            undefined,
            (err) => {
              console.error("obj could not be loaded", obj.key, err);
              objLoadHandler(c, obj.key); // unblock queue
            }
          );
        },
        (key, error) => objLoadHandler(c, key, error)
      );
    });
  });
}

export function objLoadHandler(c, key, error) {
  assetLoadHandler(
    key,
    c.objsToLoad,
    c.objsSentToLoadingManager,
    () => {
      if (!c.loadError) objLoadComplete(c);
    },
    error,
    (err) => {
      c.loadError = err;
      c.helper?.onLoadError?.(err);
    }
  );
}

export function objLoadComplete(c) {
  markLoadComplete(c, "isObjLoadComplete", "objs");
}
