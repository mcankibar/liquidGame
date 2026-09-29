import _ from "lodash-es";
import { keyFromFile, getSrc, scheduleLoad, assetLoadHandler, markLoadComplete } from "./loaderUtils";

export function loadSounds(c) {
  console.debug(`[LOADER] ${c.componentId} loadSounds start`);
  const selectedSounds = c.selectedSounds;

  // Assign keys for file-based entries upfront
  Object.values(selectedSounds).forEach((sounds) => {
    sounds.forEach((sound) => {
      if (_.has(sound, "file") && !sound.key) {
        sound.key = keyFromFile(sound.file);
      }
    });
  });

  // Early-return if everything already loaded
  const allLoaded = Object.values(selectedSounds).every((sounds) =>
    sounds.every((s) => c.loadedSoundArrayBuffersInGameMap.has(s.key))
  );
  if (allLoaded) {
    soundLoadComplete(c);
    return;
  }

  const doLoadSound = (sound) => {
    const key = sound.key;
    if (_.has(sound, "data")) {
      // Inline base64 → decode directly, no network request needed
      const arrayBuffer = c.base64ToArrayBuffer(sound.data);
      c.loadedSoundArrayBuffersInGameMap.set(key, arrayBuffer);
      soundLoadHandler(c, key);
    } else {
      const url = getSrc(sound, "./sounds");
      if (!url) {
        console.error("sound has no data/file/assetPath", key);
        soundLoadHandler(c, key); // unblock queue
        return;
      }
      return fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Sound could not be loaded: ${url}`);
          return response.arrayBuffer();
        })
        .then((buffer) => {
          c.loadedSoundArrayBuffersInGameMap.set(key, buffer);
          soundLoadHandler(c, key);
        });
    }
  };

  Object.values(selectedSounds).forEach((sounds) => {
    sounds.forEach((sound) => {
      scheduleLoad(
        sound.key,
        c.loadedSoundArrayBuffersInGameMap,
        c.soundsSentToLoadingManager,
        c.soundsToLoad,
        () => doLoadSound(sound),
        (key, error) => soundLoadHandler(c, key, error)
      );
    });
  });
}

export function soundLoadHandler(c, key, error) {
  assetLoadHandler(
    key,
    c.soundsToLoad,
    c.soundsSentToLoadingManager,
    () => {
      if (!c.loadError) soundLoadComplete(c);
    },
    error,
    (err) => {
      c.loadError = err;
      c.helper?.onLoadError?.(err);
    }
  );
}

export function soundLoadComplete(c) {
  markLoadComplete(c, "isSoundLoadComplete", "sounds");
}
