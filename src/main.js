import * as THREE from "three";
import _ from "lodash-es";
import gsap from "gsap";

import definition from "./params";
import { createRuntime, onLiveUpdate, registerInspector, updateDefinition } from "../playable/kit/runtime.js";
import { resolveActiveCamera, resizeRendererToDisplaySize as resizeCameraRenderer } from "./utils/cameraUtils";
import { END_CARD_LAYOUT } from "./config/endCardConfigs";

import {
  Playable,
  BackgroundMusic,
  Banner,
  CtaButton,
  EndCard,
  Canvas,
  OrthographicCamera,
  Scene,
  RoundedTextBox,
  EventBus,
  ComponentInitializer,
  assignAssets,
  createSceneInspector,
  Logo,
  Dimmer,
  Background,
  TutorialHand,
  FontUploader,
  SoundFxVolumeManager,
  PerspectiveCamera,
  AmbientLight,
  GLTFLoaderComponent,
  DirectionalLight,
  BackgroundPlane,
  SpriteVFXManager,
  StaticAssetLoader,
  SoundPlayer,
  deviceLanguage
} from "../lib/playinFramework3D/index";

import {
  AUDIO_CONTEXT_RESUMED_EVENT,
  FINISHED_EVENT,
  FIRST_LOAD_EVENT,
  INPUT_STATUS_EVENT,
  MOVE_EVENT
} from "../lib/playinFramework3D/modules/EventNames";

// ─── Module-level constants ────────────────────────────────────────────────
const clock = new THREE.Clock();

// ─── Game Class ───────────────────────────────────────────────────
class Game {
  constructor(runtime) {
    // Config — src/params.js defaults + the overrides embedded in the HTML (pl-config block)
    // + preview overrides sent by the Studio / dev panel. See playable/kit/runtime.js.
    this.runtime = runtime;
    this.currentGameConfig = runtime.config;
    if (this.currentGameConfig.options.language === "auto") {
      this.currentGameConfig.options.language = deviceLanguage(this.currentGameConfig);
    }

    // State flags (previously module-level variables)
    this.isGameStarted = false;
    this.isLoadingScreenStopped = false;
    this.isGameplayStarted = false;
    this.isInputEnabled = true;
    this.currentMoveCount = 0;
    this.isAudioContextSetByBlur = false;
    this.isAudioContextEventEmitted = false;

    // Component management
    this.components = new Map();
    this.eventBus = new EventBus();
    this.componentsReadyStatusMap = new Map();
    this.areComponentsReady = false;
    this.isLoadManagerOnLoadExecuted = false;

    // Misc
    this.adNetworkSettings = runtime.network;
    this.previousDeviceType = "";
    this.isFinished = false;
    this.isPaused = false;
  }

  // ─── Component Init Helpers ─────────────────────────────────────────────
  // Scene/camera assignment is identical for all orthographic/perspective
  // components, so these two helpers eliminate the repetitive 3-line pattern.

  initOrtho(ci, id, Class, extras = {}) {
    const comp = ci.initializeComponent({
      componentId: id,
      componentClass: Class,
      componentConfig: this.currentGameConfig.components[id],
      ...extras
    });
    comp.scene = this.orthoScene;
    comp.camera = this.orthoCamera;
    return comp;
  }

  initPersp(ci, id, Class, extras = {}) {
    const comp = ci.initializeComponent({
      componentId: id,
      componentClass: Class,
      componentConfig: this.currentGameConfig.components[id],
      ...extras
    });
    comp.scene = this.perspScene;
    comp.camera = this.perspectiveCamera;
    return comp;
  }

  // ─── Main Entry ─────────────────────────────────────────────────────

  main() {
    const ci = new ComponentInitializer(
      this.components,
      this.componentsReadyStatusMap,
      () => {
        this.onComponentsReady();
      },
      this.eventBus
    );

    this.setupRenderer();
    this.setupScenes(ci);
    this.setupAudio(ci);
    this.setupLights(ci);
    this.setupGameplayComponents(ci);
    this.setupEndCards(ci);
    this.setupFontUploader();
    this.setupPlayable();
    this.setupEventListeners();

    window.addEventListener("resize", this.onWindowResize.bind(this), false);
  }

  // ─── Renderer ───────────────────────────────────────────────────────

  setupRenderer() {
    this.canvas = document.querySelector("#canvas");
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas: this.canvas
    });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setPixelRatio(1);
    this.renderer.localClippingEnabled = true;
  }

  // ─── Scenes & Cameras ───────────────────────────────────────────────

  setupScenes(ci) {
    const orthoSceneComp = ci.initializeComponent({
      componentId: "orthographicScene",
      componentClass: Scene,
      componentConfig: this.currentGameConfig.components.orthographicScene
    });
    const perspSceneComp = ci.initializeComponent({
      componentId: "perspectiveScene",
      componentClass: Scene,
      componentConfig: this.currentGameConfig.components.perspectiveScene
    });
    orthoSceneComp.render();
    perspSceneComp.render();

    const orthoCamComp = ci.initializeComponent({
      componentId: "orthographicCamera",
      componentClass: OrthographicCamera,
      componentConfig: this.currentGameConfig.components.orthographicCamera
    });
    orthoCamComp.scene = orthoSceneComp.get();
    orthoCamComp.window = window;
    orthoCamComp.render();

    const perspCamComp = ci.initializeComponent({
      componentId: "perspectiveCamera",
      componentClass: PerspectiveCamera,
      componentConfig: this.currentGameConfig.components.perspectiveCamera
    });
    perspCamComp.scene = perspSceneComp.get();
    perspCamComp.render();

    // Store references used by initOrtho / initPersp and event handlers
    this.orthoScene = orthoSceneComp.get();
    this.orthoCamera = orthoCamComp.get();
    this.perspScene = perspSceneComp.get();
    this.perspectiveCameraComponent = perspCamComp;
    this.perspectiveCamera = perspCamComp.camera;
  }

  // ─── Audio ──────────────────────────────────────────────────────────

  setupAudio(ci) {
    // Assets are declared per component in src/params.js (`assets: {...}`).
    this.initPersp(ci, "soundPlayer1", SoundPlayer);
    this.initPersp(ci, "backgroundMusic1", BackgroundMusic);

    this.initPersp(ci, "soundFxVolumeManager1", SoundFxVolumeManager);
  }

  // ─── Lights ─────────────────────────────────────────────────────────

  setupLights(ci) {
    this.initPersp(ci, "ambientLight1", AmbientLight);
    this.initPersp(ci, "directionalLight1", DirectionalLight);
  }

  // ─── Gameplay Components ────────────────────────────────────────────

  setupGameplayComponents(ci) {
    // Static asset loader (orthographic)
    this.initOrtho(ci, "staticAssetLoader1", StaticAssetLoader);

    // In-game logo
    this.initOrtho(ci, "inGameLogo1", Logo);

    // Perspective full-bleed background
    this.initPersp(ci, "backgroundPlane1", BackgroundPlane);

    // GLTF scene loader (perspective)
    this.gltfLoaderComponent = this.initPersp(ci, "gltfLoader1", GLTFLoaderComponent);

    // Sprite VFX (perspective)
    this.initPersp(ci, "spriteVFXManager1", SpriteVFXManager);

    // Canvas & Banner (orthographic)
    this.initOrtho(ci, "canvas1", Canvas);
    this.initOrtho(ci, "banner1", Banner);

    // In-game rounded text box
    this.initOrtho(ci, "roundedTextBox1", RoundedTextBox);

    // In-game CTA button
    this.initOrtho(ci, "ctaButton1", CtaButton);

    // In-game tutorial hand
    this.initOrtho(ci, "tutorialHand1", TutorialHand);
  }

  // ─── End Cards (data-driven loop) ────────────────────────────────────

  setupEndCards(ci) {
    END_CARD_LAYOUT.forEach((ec) => {
      // Container
      this.initOrtho(ci, ec.endCardId, EndCard);

      // Dimmer
      this.initOrtho(ci, ec.dimmerId, Dimmer);

      // Logos
      ec.logoIds.forEach((id) => this.initOrtho(ci, id, Logo));

      // CTA Buttons
      ec.ctaIds.forEach((id) => {
        const cta = this.initOrtho(ci, id, CtaButton);
        if (!_.isNil(cta.hand)) {
          cta.handObject = this.components.get(cta.hand);
        }
      });

      // Tutorial hand, background, rounded text box
      this.initOrtho(ci, ec.handId, TutorialHand);
      this.initOrtho(ci, ec.backgroundId, Background);
      this.initOrtho(ci, ec.roundedTextBoxId, RoundedTextBox);
    });
  }

  // ─── Font Uploader ─────────────────────────────────────────────────

  setupFontUploader() {
    const { fonts, ...config } = this.currentGameConfig.components.fontUploader1;
    this.components.set("fontUploader1", new FontUploader(config));
    const fontUploader = this.components.get("fontUploader1");
    fontUploader.componentId = "fontUploader1";
    this.componentsReadyStatusMap.set("fontUploader1", false);

    fontUploader.onReady = () => {
      this.componentsReadyStatusMap.set("fontUploader1", true);
      if (Array.from(this.componentsReadyStatusMap.values()).every((v) => v === true)) {
        this.onComponentsReady();
      }
    };

    fontUploader.scene = this.perspScene;

    // { font1: { fontFamily, source: { data | assetPath } } } → { font1: { fontFamily, data | assetPath } }
    fontUploader.fonts = _.mapValues(fonts, ({ fontFamily, source }) => {
      const { key, type, ...src } = source;
      return { fontFamily, ...src };
    });
  }

  // ─── Playable ─────────────────────────────────────────────────────────

  setupPlayable() {
    this.playable = new Playable({
      adNetworkSettings: this.adNetworkSettings,
      components: this.components,
      options: this.currentGameConfig.options,
      currentGameConfig: this.currentGameConfig,
      WEBGLRenderer: this.renderer,
      onWindowResize: this.onWindowResize.bind(this),
      onPauseChange: (paused) => {
        this.isPaused = paused;
        gsap.globalTimeline.paused(paused);
      },
      eventBus: this.eventBus
    });
    this.playable.eventBus.on(
      FINISHED_EVENT,
      () => {
        this.isFinished = true;
      },
      0
    );
  }

  // ─── Event Listeners ──────────────────────────────────────────────

  setupEventListeners() {
    const tutorialHand = this.components.get("tutorialHand1");

    // MOVE_EVENT — tutorial hand scheduling
    this.eventBus.on(MOVE_EVENT, () => {
      if (this.isPaused) return;
      this.currentMoveCount++;
      if (!this.currentGameConfig.options.isTutorialEnabled) return;

      const reschedule = () => {
        this.playable.cancel(this.tutorialTimeout);
        if (this.currentMoveCount <= tutorialHand.showingMoveCount) {
          this.tutorialTimeout = this.playable.schedule(() => {
            if (this.playable.helper.getIsEndCardShown()) return;
            if (this.isTouching) {
              reschedule();
              return;
            }
            this.addTutorialHandActions();
            tutorialHand.isVisible = true;
            tutorialHand.render();
          }, tutorialHand.showingMoveTime * 1000);
        }
      };

      reschedule();
    });

    // FIRST_LOAD_EVENT — camera FOV, audio context, start game loop
    this.eventBus.on(
      FIRST_LOAD_EVENT,
      () => {
        this.perspectiveCamera.add(this.gltfLoaderComponent.audioListener);

        // Resolve which camera to use for rendering.
        // firstRender() (priority 0) already ran, so all GLB cameras are populated.
        const camCfg = this.currentGameConfig.components.perspectiveCamera;
        this.activeCamera = resolveActiveCamera(
          () => this.playable.helper.getScreenWidthHeight(),
          this.gltfLoaderComponent,
          camCfg,
          this.perspectiveCamera,
          this.perspectiveCameraComponent
        );

        this.syncBackgroundPlane();

        document.body.addEventListener("pointerdown", () => {
          if (!this.isPaused) this.eventBus.emit(MOVE_EVENT);
        });
        document.body.addEventListener("pointerup", () => {
          this.resumeAudioContext();
        });

        // Dev-only debug panel — import.meta.env.DEV is false in `vite build`, so the whole
        // SceneDebugger module is dropped from production builds.
        if (import.meta.env.DEV && this.currentGameConfig.options.isSceneDebuggerEnabled) {
          import("./utils/SceneDebugger").then(({ SceneDebugger }) => this._setupDebugger(SceneDebugger));
        }

        this.update();
      },
      10
    );

    // INPUT_STATUS_EVENT — enable/disable input
    this.eventBus.on(INPUT_STATUS_EVENT, (status) => {
      this.isInputEnabled = status;
    });

    // onComponentsReady is set here so it can close over tutorialHand
    this.onComponentsReady = () => {
      if (this.areComponentsReady) return;
      this.areComponentsReady = true;

      if (!this.isLoadingScreenStopped) {
        this.isLoadingScreenStopped = true;
        document.getElementById("loading").style.display = "none";
        this.eventBus.emit(FIRST_LOAD_EVENT);
      }

      this.playable.renderComponents(this.components);

      // Rebuild SceneDebugger's object list now that the scene is populated.
      if (this.sceneDebugger) this.sceneDebugger.refresh();

      if (!this.playable.helper.getIsEndCardShown()) {
        this.addTutorialHandActions();
        tutorialHand.render();
      }
    };
    this.playable.startPlayable();
    this.isGameStarted = true;
  }

  // ─── Audio Context ─────────────────────────────────────────────────

  /** Resumes the AudioContext on first user interaction and registers lifecycle listeners. */
  resumeAudioContext() {
    if (this.isPaused) return;
    const ctx = THREE.AudioContext.getContext();
    if (ctx.state === "suspended" || ctx.state === "interrupted") {
      ctx.resume();
    }
    if (this.isAudioContextEventEmitted) return;
    this.isAudioContextEventEmitted = true;
    this.eventBus.emit(AUDIO_CONTEXT_RESUMED_EVENT);
    this.setupAudioContextListeners();
  }

  /** Registers focus/blur/visibilitychange listeners to manage AudioContext state. */
  setupAudioContextListeners() {
    window.addEventListener("focus", () => {
      this.isAudioContextSetByBlur = false;
      if (this.isPaused) return;
      const ctx = THREE.AudioContext.getContext();
      if (ctx.state === "suspended") ctx.resume();
    });
    window.addEventListener("blur", () => {
      this.isAudioContextSetByBlur = true;
      const ctx = THREE.AudioContext.getContext();
      if (ctx.state === "running") ctx.suspend();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !this.isAudioContextSetByBlur && !this.isPaused) {
        const ctx = THREE.AudioContext.getContext();
        if (ctx.state === "suspended") ctx.resume();
      }
    });
  }

  // ─── Tutorial Hand ─────────────────────────────────────────────────

  addTutorialHandActions() {
    if (this.playable.helper.getIsEndCardShown()) return;
    const tutorialHand = this.components.get("tutorialHand1");
    if (tutorialHand.animationOption !== "custom") return;
    tutorialHand.isVisible = true;
    tutorialHand.update({ movements: [{ action: "scaleAnimation" }] });
  }

  // ─── Resize & Render ──────────────────────────────────────────────

  update() {
    this.deltaTime = clock.getDelta();

    if (this.isPaused) {
      window.requestAnimFrame(this.update.bind(this));
      return;
    }

    if (
      resizeCameraRenderer(
        this.renderer,
        () => this.playable.helper.getScreenWidthHeight(),
        this.activeCamera,
        this.currentGameConfig.components.perspectiveCamera,
        this.perspectiveCamera,
        this.perspectiveCameraComponent
      )
    ) {
      setTimeout(() => {
        this.addTutorialHandActions();
        this.components.get("tutorialHand1").render();
      }, 0);
    }

    this.render();
    if (this.sceneDebugger) this.sceneDebugger.tick();
    window.requestAnimFrame(this.update.bind(this));
  }

  render() {
    if (this.activeCamera && this.orthoCamera) {
      this.renderer.clear();
      this.renderer.render(this.perspScene, this.activeCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.orthoScene, this.orthoCamera);
    }
  }

  onWindowResize() {
    setTimeout(() => {
      this.deviceType = this.playable.getDeviceType();

      if (this.deviceType !== "desktop" && this.previousDeviceType === "desktop") {
        this.previousDeviceType = this.deviceType;
        window.removeEventListener("pointerdown", this.pointerDownListener);
        window.addEventListener("touchstart", this.pointerDownListener, {
          passive: false
        });
        window.removeEventListener("pointermove", this.pointerMoveListener);
        window.addEventListener("touchmove", this.pointerMoveListener);
        window.removeEventListener("pointerup", this.pointerUpListener);
        window.addEventListener("touchend", this.pointerUpListener);
      } else if (this.deviceType === "desktop" && this.previousDeviceType !== "desktop") {
        this.previousDeviceType = this.deviceType;
        window.removeEventListener("touchstart", this.pointerDownListener);
        window.addEventListener("pointerdown", this.pointerDownListener);
        window.removeEventListener("touchmove", this.pointerMoveListener);
        window.addEventListener("pointermove", this.pointerMoveListener);
        window.removeEventListener("touchend", this.pointerUpListener);
        window.addEventListener("pointerup", this.pointerUpListener);
      }

      const orthoCam = this.components.get("orthographicCamera");
      const screenSize = this.playable.getScreenWidthHeight();
      orthoCam.set(-screenSize.width / 2, screenSize.width / 2, screenSize.height / 2, -screenSize.height / 2);

      if (this.areComponentsReady) {
        this.components.forEach((component) => {
          if (component.componentType === "orthographic") component.render();
        });
        this.syncBackgroundPlane();
      }
    }, 0);
  }

  // ─── Background Plane ───────────────────────────────────────────────

  syncBackgroundPlane() {
    const backgroundPlane = this.components.get("backgroundPlane1");
    if (!backgroundPlane || !this.activeCamera) return;

    if (typeof backgroundPlane.setCamera === "function") {
      backgroundPlane.setCamera(this.activeCamera);
    } else {
      backgroundPlane.perspectiveCamera = this.activeCamera;
    }
    backgroundPlane.render();
  }

  // ─── Pointer Helpers ─────────────────────────────────────────────

  /** Converts a pointer/touch event to normalised NDC coords. */
  getPointerCoords(event) {
    const clientX = this.deviceType === "desktop" ? event.clientX : event.touches[0].clientX;
    const clientY = this.deviceType === "desktop" ? event.clientY : event.touches[0].clientY;
    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1
    };
  }

  // ─── Live preview ────────────────────────────────────────────────────
  // Called by playable/kit/runtime.js with the re-resolved config and the changed field paths.
  // Only fields that can change while the game runs arrive here (see needsRestart in runtime.js);
  // components re-render through the same path they use on resize, so game state is kept.

  applyLiveConfig({ config, changed }) {
    if (!this.areComponentsReady) return false;
    const componentIds = new Set();
    let optionsChanged = false;
    changed.forEach((path) => {
      const [root, id] = path.split(".");
      if (root === "components") componentIds.add(id);
      else if (root === "options") optionsChanged = true;
    });

    if (optionsChanged) {
      // Components and the Playable share this object, so they see the new values right away.
      // The language was resolved from "auto" at start; changing it restarts, so keep it here.
      const { language, ...options } = config.options;
      Object.assign(this.currentGameConfig.options, options);
    }

    componentIds.forEach((id) => {
      const component = this.components.get(id);
      if (!component) return;
      const next = config.components[id];
      this.currentGameConfig.components[id] = next;
      const { assets, ...props } = next;
      component.update(props);
      if (assets) this.replaceComponentAssets(component, assets);
      const onReady = component.onReady;
      component.onReady = () => {
        component.onReady = onReady;
        onReady();
        component.render();
      };
      component.load();
    });

    if (optionsChanged) this.playable.renderComponents(this.components);
    return true;
  }

  /** Swaps a component's image entries; textures whose key stays the same are reloaded. */
  replaceComponentAssets(component, assets) {
    const srcOf = (entry) => entry.data || entry.assetPath;
    const before = new Map();
    Object.values(component.selectedImages || {}).forEach((list) =>
      list.forEach((entry) => before.set(entry.key, srcOf(entry)))
    );
    assignAssets(component, assets);
    Object.values(component.selectedImages || {}).forEach((list) =>
      list.forEach((entry) => {
        if (before.has(entry.key) && before.get(entry.key) !== srcOf(entry)) {
          component.loadedTexturesInGameMap.delete(entry.key);
        }
      })
    );
  }

  // ─── Debug Panel (dev only) ───────────────────────────────────────

  /**
   * Initialises the SceneDebugger panel (dev server only, see FIRST_LOAD_EVENT).
   */
  _setupDebugger(SceneDebugger) {
    const camCfg = this.currentGameConfig.components.perspectiveCamera;

    this.sceneDebugger = new SceneDebugger({
      scene: this.perspScene,
      renderer: this.renderer,
      perspectiveCamera: this.perspectiveCamera,
      perspectiveCameraComponent: this.perspectiveCameraComponent,
      components: this.components,
      gltfLoaderComponent: this.gltfLoaderComponent,
      getActiveCamera: () => this.activeCamera,
      onCameraSwitch: () => {
        camCfg.useGltfCamera = !camCfg.useGltfCamera;
        this.activeCamera = resolveActiveCamera(
          () => this.playable.helper.getScreenWidthHeight(),
          this.gltfLoaderComponent,
          camCfg,
          this.perspectiveCamera,
          this.perspectiveCameraComponent
        );
        this.syncBackgroundPlane();
      }
    });
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────────
// Editing happens outside the game: the Studio / dev panel sends new overrides with a
// "pl:preview" message and the page restarts with them (playable/kit/runtime.js).

window.setIsPaused = (paused) => {
  if (game) game.playable.clock.setPaused("manual", !!paused);
};

let game;

export function initialize() {
  game = new Game(createRuntime(definition));
  game.main();
  // Preview edits (dev panel / Studio) are applied to the running game when possible.
  onLiveUpdate((update) => game.applyLiveConfig(update));
  // Studio "Select": click a part of the game to edit its fields. UI (ortho) is drawn on top.
  registerInspector(
    createSceneInspector({
      components: game.components,
      canvas: game.renderer.domElement,
      views: () => [
        { scene: game.orthoScene, camera: game.orthoCamera },
        { scene: game.perspScene, camera: game.activeCamera }
      ]
    })
  );
  if (import.meta.env.DEV) window.game = game; // console access while developing
  return game;
}

// Editing src/params.js on the dev server updates the running game instead of reloading the page.
if (import.meta.hot) {
  import.meta.hot.accept("./params", (module) => module && updateDefinition(module.default));
}

// requestAnimFrame polyfill (cross-browser shim for requestAnimationFrame)
window.requestAnimFrame = (function () {
  return (
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
      window.setTimeout(callback, 0 / 60);
    }
  );
})();
