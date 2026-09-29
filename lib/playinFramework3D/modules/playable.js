import _ from "lodash-es";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module";
import { FINISHED_EVENT, VALID_MOVE_EVENT } from "./EventNames";
import { GameClock } from "../../../playable/kit/lifecycle.js";
import { DapiHandler, MraidHandler } from "../../../playable/kit/networks.js";

export class Playable {
  constructor(props) {
    this.props = props;
    this.sdkMuted = false;
    this.clock = new GameClock((paused) => {
      this.props.onPauseChange?.(paused);
      this.updateAudio();
    });
    this.tapCount = 0;
    this.validMoveCount = 0;
    this.configs = [];
    this.isGamePlayable = false;
    this.timeElapsedSeconds = 0;
    this.validMoveCount = 0;
    this.eventBus = props.eventBus;
    this.eventBus.on(VALID_MOVE_EVENT, () => {
      this.onValidMove();
    });

    //flags
    this.gameLoaded = false;

    //raycaster
    this.raycaster = new THREE.Raycaster();

    //load Manager
    this.loadManager = new THREE.LoadingManager();

    //loaders
    this.oBJLoader = new OBJLoader(this.loadManager);
    this.textureLoader = new THREE.TextureLoader(this.loadManager);
    this.textureLoader.setCrossOrigin("anonymous"); // Fix for sandboxed iframe
    this.soundLoader = new THREE.AudioLoader(this.loadManager);
    this.gLTFLoader = new GLTFLoader(this.loadManager);
    this.gLTFLoader.setCrossOrigin("anonymous"); // Fix for sandboxed iframe
    this.gLTFLoader.setMeshoptDecoder(MeshoptDecoder);

    this.adNetworkSettings = props.adNetworkSettings;

    this.dapiHandler = new DapiHandler(this);
    this.mraidHandler = new MraidHandler(this);

    //load sets
    this.texturesSentToLoadingManager = new Set();
    this.soundsSentToLoadingManager = new Set();
    this.objsSentToLoadingManager = new Set();
    this.gltfsSentToLoadingManager = new Set();
    //loaded maps
    this.loadedObjFilesInGameMap = new Map();
    this.loadedSoundArrayBuffersInGameMap = new Map();
    this.loadedSoundBuffersInGameMap = new Map();
    this.loadedGltfFilesInGameMap = new Map();
    this.loadedTexturesInGameMap = new Map();

    //helper
    this.helper = { isEndCardShown: false };
    this.helper.components = props.components;
    this.helper.onLoadError = (error) => {
      this.pauseGame("load-error");
      console.error("Playable asset loading failed", error);
      const loading = document.getElementById("loading");
      if (loading) loading.textContent = "Unable to load this playable.";
    };
    this.helper.getIsEndCardShown = () => {
      return this.helper.isEndCardShown;
    };
    this.helper.getDeviceType = () => {
      return this.getDeviceType();
    };
    this.helper.loadManager = this.loadManager;
    this.helper.oBJLoader = this.oBJLoader;
    this.helper.textureLoader = this.textureLoader;
    this.helper.soundLoader = this.soundLoader;
    this.helper.gLTFLoader = this.gLTFLoader;
    this.helper.adNetworkSetting = props.adNetworkSettings;
    this.helper.openStore = () => {
      this.openStore();
    };
    this.helper.getScreenWidthHeight = () => {
      return this.getScreenWidthHeight();
    };

    this.eventBus.on(FINISHED_EVENT, (condition) => {
      if (this.props.options.isEndCardEnabled) {
        this.playableEnd(false, false, condition);
      } else if (this.props.options.isGoToMarketEnabled) {
        this.openStore();
        if (this.props.options.showEndCardAfterMarket) {
          this.handleEndCardAfterMarket(condition);
        }
      }
    });
  }

  renderComponents(components) {
    components.forEach((component) => {
      if (_.isNil(component.parent)) {
        console.debug("rendering parent component", component.componentId);
        this.renderComponent(component);
      }
    });
    if (!this.isGamePlayable) {
      console.debug("game is playable");
      this.isGamePlayable = true;
      this.setTimeElapsedEverySecond();
      this.adNetworkSettings.onPlayableReady?.();
      document.addEventListener("pointerdown", () => {
        this.onTap();
      });
    }
  }

  setTimeElapsedEverySecond() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      this.clock.tick(performance.now());
      if (this.clock.paused || !this.isGamePlayable) return;
      this.timeElapsedSeconds = Math.floor(this.clock.time / 1000);
      const opts = this.props.options;
      if (
        !this.helper.isEndCardShown &&
        opts.isEndCardEnabled &&
        opts.endCardSeconds > 0 &&
        this.timeElapsedSeconds >= opts.endCardSeconds
      )
        this.playableEnd();
      if (
        !this.marketTimerFired &&
        opts.isGoToMarketEnabled &&
        opts.goToMarketSeconds > 0 &&
        this.timeElapsedSeconds >= opts.goToMarketSeconds
      ) {
        this.marketTimerFired = true;
        this.openStore();
        this.handleEndCardAfterMarket();
      }
    }, 100);
  }

  get isPaused() {
    return this.clock.paused;
  }
  schedule(callback, delayMs) {
    return this.clock.schedule(callback, delayMs);
  }
  cancel(timer) {
    this.clock.cancel(timer);
  }

  onTap() {
    if (this.isPaused) return;
    this.tapCount++;
    if (
      !this.helper.isEndCardShown &&
      this.props.options.isEndCardEnabled &&
      this.props.options.endCardTaps !== 0 &&
      this.tapCount % this.props.options.endCardTaps === 0
    ) {
      console.debug("show endcard tap limit is reached.");
      this.playableEnd();
    }
    if (
      !this.helper.isEndCardShown &&
      this.props.options.isGoToMarketEnabled &&
      this.props.options.goToMarketTaps !== 0 &&
      this.tapCount % this.props.options.goToMarketTaps === 0
    ) {
      console.debug("open store tap limit is reached.");
      this.openStore();
      this.handleEndCardAfterMarket();
    }
  }

  handleEndCardAfterMarket(condition = "won") {
    if (this.props.options.showEndCardAfterMarket) {
      this.schedule(() => {
        this.playableEnd(false, true, condition);
      }, 100);
    }
  }

  onValidMove() {
    if (this.isPaused) return;
    //console.debug("valid move");
    this.validMoveCount++;
    if (
      !this.helper.isEndCardShown &&
      this.props.options.isEndCardEnabled &&
      this.props.options.endCardMoves !== 0 &&
      this.validMoveCount >= this.props.options.endCardMoves
    ) {
      console.debug("valid move limit is reached.");
      this.playableEnd();
    }
  }

  playableEnd(emitEvent = true, forceShown = false, condition = "won") {
    if (this.helper.isEndCardShown || (!this.props.options.isEndCardEnabled && !forceShown)) return;
    const endCard = [...this.props.components.values()].find(
      (component) => component.type === "endCard" && component.condition === condition
    );
    if (!endCard) throw new Error(`No endcard for condition: ${condition}`);
    // Set the guard before synchronous EventBus listeners can re-enter.
    this.helper.isEndCardShown = true;
    if (emitEvent) this.eventBus.emit(FINISHED_EVENT, condition);
    this.adNetworkSettings.onPlayableEnd?.();
    this.schedule(() => {
      this.props.components.forEach((component) => {
        if (["ctaButton", "tutorialHand"].includes(component.type) && component.isInGameComponent === true) {
          component.IsVisible = false;
          component.render();
        }
      });
      endCard.IsVisible = true;
      endCard.render();
    }, this.props.options.endCardDelay * 1000);
  }

  getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return "tablet";
    }
    if (
      /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)
    ) {
      return "mobile";
    }
    return "desktop";
  }

  get IsEndCardShown() {
    return this.helper.isEndCardShown;
  }

  /**
   * render a component and its children.
   * @param component
   */
  renderComponent(component) {
    if (!_.has(component, "scene")) {
      console.warn("this component: ", component.componentId, "has no scene set from main");
    }

    console.debug("this component is rendering", component);
    component.render();
    this.props.components.forEach((childCandidate) => {
      if (!_.isNil(childCandidate.parentId) && childCandidate.parentId === component.componentId) {
        this.renderComponent(childCandidate);
      }
    });
  }

  openStore() {
    if (this.isPaused) return;
    let platform = "android";
    if (["iPad", "MacIntel", "iPhone", "iPod"].indexOf(navigator.platform) >= 0) {
      platform = "ios";
    }

    const redirectUrl = this.getStoreUrlByPlatform(platform);
    this.adNetworkSettings.handleOpenStore(redirectUrl);
  }

  getStoreUrlByPlatform(platform) {
    let androidLink = _.get(this, "props.options.link.android", null);
    let iosLink = _.get(this, "props.options.link.ios", null);
    if (_.isNil(androidLink)) {
      throw "Android link is nil";
    }
    if (_.isNil(iosLink)) {
      throw "Ios link is nil";
    }
    if (!String(androidLink).startsWith("http")) {
      androidLink = "http://" + androidLink;
    }
    if (!String(iosLink).startsWith("http")) {
      iosLink = "http://" + iosLink;
    }
    if (platform === "android") {
      return androidLink;
    } else if (platform === "ios") {
      return iosLink;
    } else {
      return androidLink;
    }
  }

  consumePanelConfigs() {
    while (this.configs.length > 0) {
      const config = this.configs.shift();
      const configOptions = _.get(config, "options", []);
      Object.entries(config.options).forEach(([option, detail]) => {
        const configOption = _.get(config, `options.${option}`);
        const currentGameConfigOption = _.get(this, `props.currentGameConfig.options.${option}`);
        if (!_.isEqual(currentGameConfigOption, configOption)) {
          _.set(this, `props.currentGameConfig.options.${option}`, configOption);
        }
      });
      this.props.components.forEach((component, componentId) => {
        component.options = this.props.currentGameConfig.options;
      });
      let numReady = 0;
      let numToBeUpdated = 0;
      let componentsToBeUpdated = [];
      let readyComponents = [];
      const configComponents = _.get(config, "components", []);
      Object.entries(configComponents).forEach(([componentId, details]) => {
        const configComponentProps = _.get(config, `components.${componentId}`);
        const currentGameConfigComponentProps = _.get(this, `props.currentGameConfig.components.${componentId}`);
        if (!_.isEqual(configComponentProps, currentGameConfigComponentProps)) {
          Object.entries(configComponentProps).forEach(([propertyId, propertyDetails]) => {
            _.set(this, `props.currentGameConfig.components.${componentId}.${propertyId}`, propertyDetails);
          });
          const component = this.props.components.get(componentId);
          componentsToBeUpdated.push([component, configComponentProps]);
          numToBeUpdated++;
        }
      });
      //TODO TEMPORARY SOLUTION
      componentsToBeUpdated = componentsToBeUpdated.filter(([component, props]) => {
        if (_.has(component, "componentType")) {
          return component;
        }
      });
      componentsToBeUpdated.forEach(([component, props]) => {
        component.update(props);
      });
    }
  }

  getScreenWidthHeight() {
    if (this.dapiHandler.isAvailable() && this.dapiHandler.isReady()) {
      return {
        width: this.dapiHandler.screenSize.width * window.devicePixelRatio,
        height: this.dapiHandler.screenSize.height * window.devicePixelRatio
      };
    } else if (this.mraidHandler.isAvailable() && this.mraidHandler.isReady()) {
      return {
        width: this.mraidHandler.screenSize.width * window.devicePixelRatio,
        height: this.mraidHandler.screenSize.height * window.devicePixelRatio
      };
    } else if (_.isFunction(this.adNetworkSettings.getWidthHeight)) {
      return this.adNetworkSettings.getWidthHeight();
    } else {
      return {
        width: document.documentElement.clientWidth * window.devicePixelRatio,
        height: document.documentElement.clientHeight * window.devicePixelRatio
      };
    }
  }

  //Routes resize event, coming from ad network SDKs
  handleResizeEvent() {
    this.props.onWindowResize();
  }

  updateAudio() {
    this.audioListener?.setMasterVolume(this.isPaused || this.sdkMuted || !this.props.options.isSoundEnabled ? 0 : 1);
  }
  muteGame() {
    this.sdkMuted = true;
    this.updateAudio();
  }
  unmuteGame() {
    this.sdkMuted = false;
    this.updateAudio();
  }
  pauseGame(reason = "manual") {
    this.clock.setPaused(reason, true);
  }
  resumeGame(reason = "manual") {
    this.clock.setPaused(reason, false);
  }

  get isMraidAvailable() {
    return typeof mraid !== "undefined";
  }

  isDapiAvailable() {
    return typeof dapi !== "undefined";
  }

  loadGame() {
    if (this.gameLoaded) {
      console.log("[i] Game is already loaded. Skipping loadGame()");
      return;
    }

    this.gameLoaded = true;
    this.props.components.forEach((component) => {
      if (_.has(component, "componentType")) {
        component.load();
      }
    });
    this.gameLoaded = true;
  }

  startPlayable() {
    //referencing useful properties to components
    this.audioListener = new THREE.AudioListener();
    this.updateAudio();
    const visibility = () => this.clock.setPaused("document", document.hidden);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    if (this.adNetworkSettings.name === "mintegral") {
      this.clock.setPaused("host", window.__PL_HOST_STARTED__ !== true);
      window.addEventListener("pl:host-start", () => this.resumeGame("host"));
      window.addEventListener("pl:host-close", () => this.pauseGame("host"));
    }
    this.props.components.forEach((component) => {
      component.options = this.props.options;
      component.helper = this.helper;
      component.WEBGLRenderer = this.props.WEBGLRenderer;

      component.loadedTexturesInGameMap = this.loadedTexturesInGameMap;
      component.loadedSoundArrayBuffersInGameMap = this.loadedSoundArrayBuffersInGameMap;
      component.loadedSoundBuffersInGameMap = this.loadedSoundBuffersInGameMap;
      component.loadedObjFilesInGameMap = this.loadedObjFilesInGameMap;
      component.loadedGltfFilesInGameMap = this.loadedGltfFilesInGameMap;

      component.texturesSentToLoadingManager = this.texturesSentToLoadingManager;
      component.soundsSentToLoadingManager = this.soundsSentToLoadingManager;
      component.objsSentToLoadingManager = this.objsSentToLoadingManager;
      component.gltfsSentToLoadingManager = this.gltfsSentToLoadingManager;
      component.raycaster = this.raycaster;
      component.loadManager = this.loadManager;
      component.oBJLoader = this.oBJLoader;
      component.textureLoader = this.textureLoader;
      component.soundLoader = this.soundLoader;
      component.gLTFLoader = this.gLTFLoader;
      component.eventBus = this.eventBus;
      component.audioListener = this.audioListener;
    });

    let shouldInitViaApi = false;

    if (this.mraidHandler.isAvailable()) {
      console.log("[i] MRAID is available. Initializing MRAID handler.");
      shouldInitViaApi = true;
      this.mraidHandler.initialize();
    } else if (this.dapiHandler.isAvailable()) {
      console.log("[i] DAPI is available. Initializing DAPI handler.");
      shouldInitViaApi = true;
      this.dapiHandler.initialize();
    }
    if (!shouldInitViaApi) {
      console.warn("[!] No MRAID or DAPI detected. Initializing game immediately.");
      this.loadGame();
    }
  }
}
