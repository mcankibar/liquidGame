// Runtime side of the ad networks (store opening, lifecycle hooks, MRAID/DAPI handlers).
// Ported from @common-packages/ad-network-settings so the template no longer needs the private
// registry. Every network lives in the same bundle; the network is picked at runtime from
// window.__PL_NETWORK__, which the exporter writes into the HTML. Build-time differences (head tags,
// file splitting, SDK tags) live in playable/export/networks.js.

const isFn = (f) => typeof f === "function";

function mraidOpen(url, network) {
  if (typeof mraid === "undefined" || !isFn(mraid.open)) return false;
  if (network === "applovin") mraid.open();
  else mraid.open(url);
  return true;
}

function dapiOpen(url) {
  if (typeof dapi === "undefined" || !dapi || !isFn(dapi.openStoreUrl)) return false;
  dapi.openStoreUrl(url);
  return true;
}

const viaMraidDapiOr = (fallback) => (url) => mraidOpen(url) || dapiOpen(url) || fallback(url);
const windowOpen = (url) => window.open(url);

const defaults = {
  handleOpenStore: windowOpen
};

const settings = {
  default: {},
  applovin: {
    handleOpenStore: (url) => mraidOpen(url, "applovin") || dapiOpen(url) || windowOpen(url)
  },
  unity: { handleOpenStore: viaMraidDapiOr(windowOpen) },
  ironsource: { handleOpenStore: viaMraidDapiOr(windowOpen) },
  appgrowth: { handleOpenStore: viaMraidDapiOr(windowOpen) },
  mintegral: {
    handleOpenStore: () => {
      if (isFn(window.install)) window.install();
    },
    onPlayableReady: () => {
      if (isFn(window.gameReady)) window.gameReady();
      else console.error("Mintegral: window.gameReady() cannot be found.");
    },
    onPlayableEnd: () => {
      if (isFn(window.gameEnd)) window.gameEnd();
    },
    getWidthHeight: () => ({
      width: (document.documentElement.clientWidth || 1) * window.devicePixelRatio,
      height: (document.documentElement.clientHeight || 1) * window.devicePixelRatio
    })
  },
  facebook: {
    handleOpenStore: (url) => {
      if (mraidOpen(url, "facebook") || dapiOpen(url)) return;
      if (typeof FbPlayableAd === "undefined" || !isFn(FbPlayableAd.onCTAClick)) {
        console.error("FbPlayableAd.onCTAClick is not available");
        return;
      }
      FbPlayableAd.onCTAClick();
    },
    getWidthHeight: () => ({
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio
    })
  },
  moloco: {
    handleOpenStore: (url) => {
      if (mraidOpen(url) || dapiOpen(url)) return;
      if (typeof FbPlayableAd === "undefined" || !isFn(FbPlayableAd.onCTAClick)) {
        console.error("Moloco: FbPlayableAd.onCTAClick is not available");
        return;
      }
      FbPlayableAd.onCTAClick();
    }
  },
  google: {
    handleOpenStore: () => {
      if (typeof ExitApi === "undefined" || !isFn(ExitApi.exit)) {
        console.error("Google: ExitApi.exit is not available");
        return;
      }
      ExitApi.exit();
    }
  },
  liftoff: {
    handleOpenStore: (url) => {
      const ok = mraidOpen(url);
      parent.postMessage("download", "*");
      if (!ok) windowOpen(url);
    },
    onPlayableEnd: () => parent.postMessage("complete", "*")
  },
  tiktok: {
    handleOpenStore: () => {
      if (!isFn(window.openAppStore)) {
        console.error("Tiktok: window.openAppStore is not available");
        return;
      }
      window.openAppStore();
    }
  },
  smadex: {
    handleOpenStore: () => {
      if (typeof smxTracking === "undefined" || !isFn(smxTracking.redirect)) {
        console.error("Smadex: smxTracking.redirect is not available");
        return;
      }
      smxTracking.redirect();
    }
  }
};

export const NETWORKS = Object.keys(settings);

export function currentNetwork() {
  const n = typeof window !== "undefined" && window.__PL_NETWORK__;
  return n && Object.prototype.hasOwnProperty.call(settings, n) ? n : "default";
}

export function getNetworkSettings(network = currentNetwork()) {
  return { name: network, ...defaults, ...(settings[network] || {}) };
}

// ── API handlers (MRAID / DAPI) ──────────────────────────────────────────────

export class DapiHandler {
  constructor(playable) {
    this.playable = playable;
    this.isDapiReady = false;
    this.isDapiViewable = false;
    this._screenSize = null;
  }
  get screenSize() {
    this.updateSize();
    return this._screenSize;
  }
  isAvailable() {
    return typeof dapi !== "undefined" && !!dapi;
  }
  initialize() {
    if (!this.isAvailable()) return false;
    if (dapi.isReady()) this.onDapiReady();
    else dapi.addEventListener("ready", () => this.onDapiReady());
    return true;
  }
  updateSize() {
    const fallback = { width: window.innerWidth, height: window.innerHeight };
    try {
      if (this.isAvailable() && dapi.isReady() && isFn(dapi.getScreenSize)) {
        const sz = dapi.getScreenSize();
        this._screenSize = {
          width: sz.width > 0 ? sz.width : fallback.width,
          height: sz.height > 0 ? sz.height : fallback.height
        };
      } else this._screenSize = fallback;
    } catch (e) {
      this._screenSize = fallback;
    }
  }
  onDapiReady() {
    if (this.isDapiReady) return;
    this.isDapiReady = true;
    dapi.addEventListener("adResized", () => {
      this.updateSize();
      this.playable.handleResizeEvent(this._screenSize);
    });
    dapi.addEventListener("viewableChange", (event) => this.handleViewableChange(event));
    dapi.addEventListener("audioVolumeChange", (volume) =>
      volume ? this.playable.unmuteGame() : this.playable.muteGame()
    );
    this.handleViewableChange({ isViewable: dapi.isViewable() });
  }
  handleViewableChange(event) {
    this.isDapiViewable = event.isViewable;
    if (event.isViewable) this.playable.resumeGame("sdk");
    else this.playable.pauseGame("sdk");
    if (this.playable.isGamePlayable) {
      if (event.isViewable) {
        this.playable.unmuteGame();
      } else {
        this.playable.muteGame();
      }
    } else if (event.isViewable) {
      this.playable.loadGame();
    }
  }
  isReady() {
    return this.isDapiReady;
  }
  isViewable() {
    return this.isDapiViewable;
  }
}

export class MraidHandler {
  constructor(playable) {
    this.playable = playable;
    this.isMraidReady = false;
    this.volumePercentage = 1;
    this.exposurePercentage = 1;
    this.viewableState = true;
    this._screenSize = null;
  }
  get screenSize() {
    this._screenSize = this.resolveScreenSize();
    return this._screenSize;
  }
  resolveScreenSize() {
    let max = null;
    try {
      max = isFn(mraid.getMaxSize) ? mraid.getMaxSize() : null;
    } catch (e) {
      max = null;
    }
    if (!max || !max.width || !max.height) return { width: window.innerWidth, height: window.innerHeight };
    return { width: max.width, height: max.height };
  }
  isAvailable() {
    return typeof mraid !== "undefined";
  }
  isViewable() {
    return this.isAvailable() && mraid.isViewable();
  }
  initialize() {
    if (!this.isAvailable()) return false;
    mraid.addEventListener("error", console.error);
    if (mraid.getState() === "loading") mraid.addEventListener("ready", () => this.onMraidReady());
    else this.onMraidReady();
    return true;
  }
  onMraidReady() {
    if (this.isMraidReady) return;
    this.isMraidReady = true;
    this._screenSize = this.resolveScreenSize();
    mraid.addEventListener("sizeChange", () => {
      this._screenSize = this.resolveScreenSize();
      this.playable.handleResizeEvent();
    });
    mraid.addEventListener("viewableChange", (viewable) => this.handleViewableChange(viewable));
    mraid.addEventListener("audioVolumeChange", (v) => {
      this.volumePercentage = v === null ? 0 : v;
      this.updateGameVolume();
    });
    mraid.addEventListener("exposureChange", (e) => {
      this.exposurePercentage = e;
      this.updateGameVolume();
    });
    this.handleViewableChange(mraid.isViewable());
  }
  handleViewableChange(viewable) {
    this.viewableState = viewable;
    if (viewable) this.playable.resumeGame("sdk");
    else this.playable.pauseGame("sdk");
    if (this.playable.isGamePlayable) {
      this.updateGameVolume();
    } else if (viewable) {
      this.playable.loadGame();
    }
  }
  updateGameVolume() {
    const muted = this.volumePercentage === 0 || this.exposurePercentage === 0 || this.viewableState === false;
    if (muted) this.playable.muteGame();
    else this.playable.unmuteGame();
  }
  isReady() {
    return this.isMraidReady;
  }
}
