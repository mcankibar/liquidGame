import * as THREE from "three";
import gsap from "gsap";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import definition from "./params";
import { createRuntime, onLiveUpdate, registerInspector, updateDefinition } from "../playable/kit/runtime.js";
import { resolveActiveCamera, resizeRendererToDisplaySize as resizeCameraRenderer } from "./utils/cameraUtils";
import { LEVELS } from "./game/levels.js";
import { createSession, finish, levelOf, nextLevel, retry, targetRgb } from "./game/session.js";
import { mixRgb, toHex } from "./game/mix.js";
import { MixingBench } from "./game/bench.js";
import { mountHud } from "./game/hud.js";
import { GameAudio } from "./game/audio.js";
import { defaultGameConfig, gameConfigLabels, gameConfigRanges } from "./gameConfig/defaultGameConfig.js";

import {
  Playable,
  EventBus,
  ComponentInitializer,
  createSceneInspector,
  Scene,
  OrthographicCamera,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  deviceLanguage
} from "../lib/playinFramework3D/index";

import { FIRST_LOAD_EVENT } from "../lib/playinFramework3D/modules/EventNames";

const tuning = defaultGameConfig.components;

class Game {
  constructor(runtime) {
    this.runtime = runtime;
    this.currentGameConfig = runtime.config;
    if (this.currentGameConfig.options.language === "auto") {
      this.currentGameConfig.options.language = deviceLanguage(this.currentGameConfig);
    }

    this.components = new Map();
    this.eventBus = new EventBus();
    this.componentsReadyStatusMap = new Map();
    this.areComponentsReady = false;
    this.adNetworkSettings = runtime.network;
    this.isFinished = false;
    this.isPaused = false;
    this.session = createSession(LEVELS);
  }

  gameTitle() {
    const lang = this.currentGameConfig.options.language;
    const block = this.currentGameConfig.components.studio.localization;
    return block[lang]?.caption || block.en.caption;
  }

  initOrtho(ci, id, Class) {
    const comp = ci.initializeComponent({
      componentId: id,
      componentClass: Class,
      componentConfig: this.currentGameConfig.components[id]
    });
    comp.scene = this.orthoScene;
    comp.camera = this.orthoCamera;
    return comp;
  }

  initPersp(ci, id, Class) {
    const comp = ci.initializeComponent({
      componentId: id,
      componentClass: Class,
      componentConfig: this.currentGameConfig.components[id]
    });
    comp.scene = this.perspScene;
    comp.camera = this.perspectiveCamera;
    return comp;
  }

  main() {
    const ci = new ComponentInitializer(
      this.components,
      this.componentsReadyStatusMap,
      () => this.onComponentsReady(),
      this.eventBus
    );

    this.setupRenderer();
    this.setupScenes(ci);
    this.setupLights(ci);
    this.setupPlayable();
    this.setupEventListeners();
    window.addEventListener("resize", () => this.onWindowResize(), false);
  }

  setupRenderer() {
    this.canvas = document.querySelector("#canvas");
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      canvas: this.canvas
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setPixelRatio(1);
  }

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

    this.orthoScene = orthoSceneComp.get();
    this.orthoCamera = orthoCamComp.get();
    this.perspScene = perspSceneComp.get();
    this.perspectiveCameraComponent = perspCamComp;
    this.perspectiveCamera = perspCamComp.camera;

    this.fillLight = new THREE.DirectionalLight();
    this.fillLight.position.set(-5, 3.5, -2);
    this.rimLight = new THREE.DirectionalLight();
    this.rimLight.position.set(-1.5, 5, -6);
    // Warm key from above the player's shoulder plus a sky/floor fill, so the room reads lit
    // rather than only candle-lit.
    this.keyLight = new THREE.DirectionalLight();
    this.keyLight.position.set(2.5, 7, 5);
    this.hemiLight = new THREE.HemisphereLight();
    this.perspScene.add(this.fillLight, this.rimLight, this.keyLight, this.hemiLight);
    this.applyTuning();
  }

  setupLights(ci) {
    this.initPersp(ci, "ambientLight1", AmbientLight);
    this.initPersp(ci, "directionalLight1", DirectionalLight);
  }

  setupPlayable() {
    this.playable = new Playable({
      adNetworkSettings: this.adNetworkSettings,
      components: this.components,
      options: this.currentGameConfig.options,
      currentGameConfig: this.currentGameConfig,
      WEBGLRenderer: this.renderer,
      onWindowResize: () => this.onWindowResize(),
      onPauseChange: (paused) => {
        this.isPaused = paused;
        gsap.globalTimeline.paused(paused);
      },
      eventBus: this.eventBus
    });
  }

  setupEventListeners() {
    this.eventBus.on(
      FIRST_LOAD_EVENT,
      () => {
        const camCfg = this.currentGameConfig.components.perspectiveCamera;
        this.activeCamera = resolveActiveCamera(
          () => this.renderSize(),
          null,
          camCfg,
          this.perspectiveCamera,
          this.perspectiveCameraComponent
        );
        this.mountGame();
        this.update();
      },
      10
    );

    this.onComponentsReady = () => {
      if (this.areComponentsReady) return;
      this.areComponentsReady = true;
      this.eventBus.emit(FIRST_LOAD_EVENT);
      this.playable.renderComponents(this.components);
      if (this.sceneDebugger) this.sceneDebugger.refresh();
    };

    this.playable.startPlayable();
  }

  mountGame() {
    this.audio = new GameAudio(this.playable.audioListener);
    this.hud = mountHud(
      {
        onRetry: () => this.onRetry(),
        onNext: () => this.onNext(),
        onPlay: () => this.onPlay(),
        onAgain: () => this.onAgain()
      },
      this.currentGameConfig.components.tutorialHand?.assets?.hand
    );
    this.table = new MixingBench(this.perspScene, this.activeCamera, this.canvas, this.renderer, {
      onProgress: (progress) => this.hud.setProgress(progress),
      onGuide: (point) => this.hud.setGuide(point),
      onReferenceTag: (point) => this.hud.setTag(point),
      safeTop: () => this.hud.cardBottom(),
      onPick: () => {
        this.audio.pick();
        this.hud.hideHint(); // the first tap is enough; it comes back with the next level
      },
      onSlide: () => this.audio.whoosh(),
      onFinish: (mix) => this.onFinish(mix)
    });
    // Empty bench first; the glasses come in when the player presses play.
    this.stars = [];
    this.startLevel();
    this.table.stageOut();
    this.hud.showStart(this.gameTitle());

    if (import.meta.env.DEV && this.currentGameConfig.options.isSceneDebuggerEnabled) {
      import("./utils/SceneDebugger").then(({ SceneDebugger }) => this.setupDebugger(SceneDebugger));
    }
  }

  startLevel() {
    const level = levelOf(this.session);
    document.title = `${this.gameTitle()} — ${level.name}`;
    this.hud.hideResult();
    this.hud.setTarget({
      name: level.name,
      hex: toHex(targetRgb(this.session)),
      index: this.session.index,
      count: this.session.levels.length
    });
    this.table.show(this.session);
  }

  /** Build the level off-stage and slide it in. */
  enterLevel() {
    this.startLevel();
    return this.table.enter();
  }

  /** Clear the current glasses off the bench (they slide away, the goal flies up), then `next`. */
  async changeLevel(next) {
    if (this.changing) return;
    this.changing = true;
    this.hud.hideResult();
    await this.table.exit();
    next();
    this.changing = false;
  }

  onPlay() {
    if (this.playing) return;
    this.playing = true;
    // The dimmer fades out, then the glasses come in.
    this.hud.hideStart().then(() => this.table.enter());
  }

  onFinish(mix) {
    const outcome = finish(this.session, mix);
    if (outcome.pass) {
      this.stars[this.session.index] = Math.max(this.stars[this.session.index] || 0, outcome.stars);
    }
    if (outcome.pass && outcome.last) {
      // Last colour done: clear the bench and celebrate instead of showing the result card. The win
      // sound plays once, with the celebration screen.
      setTimeout(
        () =>
          this.changeLevel(() => {
            this.audio.win(3);
            this.hud.showCelebration({
              stars: this.stars.reduce((sum, n) => sum + (n || 0), 0),
              maxStars: this.session.levels.length * 3
            });
          }),
        700
      );
      return;
    }
    if (outcome.pass) this.audio.win(outcome.stars);
    else this.audio.lose();
    this.hud.showResult(outcome, toHex(targetRgb(this.session)), toHex(mixRgb(mix) || [1, 1, 1]));
  }

  onRetry() {
    this.changeLevel(() => {
      retry(this.session);
      this.enterLevel();
    });
  }

  onNext() {
    this.changeLevel(() => {
      if (nextLevel(this.session)) this.enterLevel();
    });
  }

  onAgain() {
    this.hud.hideCelebration();
    nextLevel(this.session); // the last level passed, so this wraps to the first
    this.stars = [];
    this.enterLevel();
  }

  /**
   * Drawing-buffer size. The framework reports device pixels; filling all of them (up to 3x DPR)
   * with MSAA and bloom is what made the game fill-rate bound, so cap the effective DPR and the
   * pixel count. Nothing is scaled at runtime; bloom is on or off as the config says.
   */
  renderSize() {
    const { width, height } = this.playable.helper.getScreenWidthHeight();
    const dpr = window.devicePixelRatio || 1;
    const { maxDpr, maxPixels } = tuning.quality;
    const cap = Math.min(1, maxDpr / dpr, Math.sqrt(maxPixels / (width * height)));
    return { width: Math.max(1, Math.round(width * cap)), height: Math.max(1, Math.round(height * cap)) };
  }

  update() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this.lastFrame ?? now)) / 1000);
    this.lastFrame = now;
    if (!this.isPaused) {
      const resized = resizeCameraRenderer(
        this.renderer,
        () => this.renderSize(),
        this.activeCamera,
        this.currentGameConfig.components.perspectiveCamera,
        this.perspectiveCamera,
        this.perspectiveCameraComponent
      );
      if (resized && this.table) this.table.needsFrame = true;
      if (this.table) this.table.tick(dt);
      if (this.table) this.hud.setHintTop(this.table.shelfBottomPx());
      if (this.table && this.hud.isStartShown()) this.hud.setStartTop(this.table.shelfBottomPx());
      if (this.table) this.audio.update(dt, this.table.pourStrength, this.table.fillRatio);
      if (this.table?.needsFrame && this.activeCamera) {
        this.table.frame(this.activeCamera);
        this.table.needsFrame = false;
      }
      this.render();
      if (this.sceneDebugger) this.sceneDebugger.tick();
    }
    window.requestAnimFrame(() => this.update());
  }

  setupComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const samples = size.x * size.y > 1.3e6 ? 2 : 4;
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.perspScene, this.activeCamera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 1, 0.5, 0.8);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.composerSize = new THREE.Vector2();
    this.applyBloom();
  }

  applyBloom() {
    const { strength, threshold, radius } = tuning.bloom;
    this.bloomPass.strength = strength;
    this.bloomPass.threshold = threshold;
    this.bloomPass.radius = radius;
  }

  /** Values from defaultGameConfig that live outside the bench; cheap enough to apply every frame. */
  applyTuning() {
    const { exposure, key, ambient, fill, rim, environment } = tuning.lighting;
    this.renderer.toneMappingExposure = exposure;
    this.keyLight.color.set(key.color);
    this.keyLight.intensity = key.intensity;
    this.hemiLight.color.set(ambient.skyColor);
    this.hemiLight.groundColor.set(ambient.groundColor);
    this.hemiLight.intensity = ambient.intensity;
    if (this.table) this.table.setEnvironmentIntensity(environment);
    this.fillLight.color.set(fill.color);
    this.fillLight.intensity = fill.intensity;
    this.rimLight.color.set(rim.color);
    this.rimLight.intensity = rim.intensity;
  }

  render() {
    if (!this.activeCamera || !this.orthoCamera) return;
    this.applyTuning();
    if (!tuning.bloom.enabled) {
      this.renderer.clear();
      this.renderer.render(this.perspScene, this.activeCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.orthoScene, this.orthoCamera);
      return;
    }
    if (!this.composer) this.setupComposer();
    const size = this.renderer.getSize(new THREE.Vector2());
    if (!size.equals(this.composerSize)) {
      this.composerSize.copy(size);
      this.composer.setSize(size.x, size.y);
      this.bloomPass.setSize(size.x / 2, size.y / 2);
    }
    this.renderPass.camera = this.activeCamera;
    this.applyBloom();
    this.renderer.clear();
    this.composer.render();
    this.renderer.clearDepth();
    this.renderer.render(this.orthoScene, this.orthoCamera);
  }

  onWindowResize() {
    const orthoCam = this.components.get("orthographicCamera");
    const screenSize = this.playable.getScreenWidthHeight();
    orthoCam.set(-screenSize.width / 2, screenSize.width / 2, screenSize.height / 2, -screenSize.height / 2);
    if (this.areComponentsReady) {
      this.components.forEach((component) => {
        if (component.componentType === "orthographic") component.render();
      });
      if (this.table) this.table.needsFrame = true;
    }
  }

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
      const { language, ...options } = config.options;
      Object.assign(this.currentGameConfig.options, options);
    }

    componentIds.forEach((id) => {
      const component = this.components.get(id);
      const next = config.components[id];
      this.currentGameConfig.components[id] = next;
      if (!component) return;
      const { assets, ...props } = next;
      component.update(props);
      component.render();
    });

    if (componentIds.has("perspectiveCamera") && this.table) this.table.needsFrame = true;
    if (optionsChanged) {
      this.playable.renderComponents(this.components);
    }
    return true;
  }

  setupDebugger(SceneDebugger) {
    this.sceneDebugger = new SceneDebugger({
      scene: this.perspScene,
      renderer: this.renderer,
      perspectiveCamera: this.perspectiveCamera,
      perspectiveCameraComponent: this.perspectiveCameraComponent,
      components: this.components,
      gltfLoaderComponent: null,
      getActiveCamera: () => this.activeCamera,
      onCameraSwitch: null,
      gameConfig: defaultGameConfig,
      gameConfigRanges,
      gameConfigLabels,
      onGameConfigChange: (path) => this.onTuningChange(path)
    });
  }

  /** Most tuning is read every frame; these need the camera re-framed or the level rebuilt. */
  onTuningChange(path) {
    if (!this.table) return;
    if (path.startsWith("mixer.") || path.startsWith("sources.") || path === "pour.hoverTilt") {
      this.table.show(this.session);
    } else if (path.startsWith("camera.") || path.startsWith("goalShelf.")) {
      this.table.needsFrame = true;
    }
  }
}

window.setIsPaused = (paused) => {
  if (game) game.playable.clock.setPaused("manual", !!paused);
};

let game;

export function initialize() {
  game = new Game(createRuntime(definition));
  game.main();
  onLiveUpdate((update) => game.applyLiveConfig(update));
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
  if (import.meta.env.DEV) {
    window.game = game;
    window.gsap = gsap;
  }
  return game;
}

if (import.meta.hot) {
  import.meta.hot.accept("./params", (module) => module && updateDefinition(module.default));
}

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
