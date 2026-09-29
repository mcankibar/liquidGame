// ─────────────────────────────────────────────────────────────────────────────
//  The single source of truth for the playable's configuration.
//
//  • Plain values are internal constants — only the developer changes them.
//  • Values wrapped in num / bool / color / text / select / image / sound / model / font are
//    editable: they appear in the dev panel, in the exported manifest and in the Studio, and a
//    variant can override them without rebuilding the game.
//  • Assets live next to the component that uses them (`assets: { slot: image("file.png") }`),
//    paths are relative to /assets. Components with isEnabled === false don't ship their images.
//  • loc({...}) is a localization block written once; texts inside it take { en, tr, ... } maps.
//
//  Renaming an editable path? Add { was: "old.path" } to the field so existing variants migrate.
//  { restart: true } marks values the game only reads when it starts (e.g. a level layout):
//  changing them restarts the preview. Everything else is applied to the running game.
// ─────────────────────────────────────────────────────────────────────────────

import {
  defineConfig,
  group,
  loc,
  pos,
  orient,
  num,
  bool,
  color,
  text,
  language,
  image,
  sound,
  model,
  font,
  data,
  atlas,
  spine
} from "../playable/kit/fields.js";

const FONT = "clashDisplayBold";
const fontSize = (v) => num(v, { min: 0.05, max: 2, step: 0.01 });
const unitScale = (p, l) => orient(p, l, { min: 0.05, max: 2, step: 0.005 });
const seconds = (v, max = 10) => num(v, { min: 0, max, step: 0.05 });

// Fields shared by every tutorial hand.
const handTimings = {
  delayInMilliseconds: 300,
  initialOpacity: 1,
  radiusPercentage: 0.15,
  infinitySignMoveDurationInSeconds: 10,
  circleMoveDurationInSeconds: 3.75,
  moveToDurationInSeconds: 1,
  fadeOutDurationInSeconds: 0.5,
  fadeInDurationInSeconds: 0.5,
  scaleAnimationDurationInSeconds: 0.5
};

const ONE = { width: 1, height: 1 };
const fullSize = { portrait: ONE, landscape: ONE };
const center = { portrait: { x: 0.5, y: 0.5 }, landscape: { x: 0.5, y: 0.5 } };

function endCardLabel(caption, fontSizeValue, originY = 0.5) {
  return loc({
    caption: text(caption),
    fontFamily: FONT,
    fontSize: fontSize(fontSizeValue),
    fontStyle: "500",
    fontColor: color("#ffffff"),
    origin: { x: 0.5, y: originY }
  });
}

export default defineConfig({
  components: {
    perspectiveScene: {
      componentType: "perspective",
      background: { isTexture: false, color: color(0x000000, { label: "Background color" }) }
    },

    ambientLight1: group("Ambient light", {
      componentType: "perspective",
      color: color(0xffffff),
      intensity: num(2, { min: 0, max: 10, step: 0.1 })
    }),

    perspectiveCamera: group("Camera", {
      componentType: "perspective",
      fov: num(50, { min: 10, max: 120, step: 1 }),
      near: 0.001,
      far: 1000,
      position: { x: 0, y: 5, z: 10 },
      lookAtCoordinates: { x: 0, y: 0, z: 0 },
      // When true, the camera embedded in the GLB is used instead of the default perspective camera.
      // The GLB camera can be either a PerspectiveCamera or an OrthographicCamera.
      useGltfCamera: false,
      // refFov + refAspect define the FOV formula reference point for the built-in perspective camera.
      // refFov  = vertical FOV (°) that looks correct at refAspect.
      // refAspect = aspect ratio (w/h) the scene was calibrated for.
      // Horizontal scene coverage stays constant across all aspect ratios.
      refFov: num(50, { min: 10, max: 120, step: 1, label: "Reference FOV" }),
      refAspect: 0.5625,
      // World-unit view sizes used when the GLB camera is an OrthographicCamera.
      // portraitViewSize  = half-width  of the frustum in portrait  orientation.
      // landscapeViewSize = half-height of the frustum in landscape orientation.
      orthoPortraitViewSize: 14,
      orthoLandscapeViewSize: 24
    }),

    spriteVFXManager1: {
      componentType: "perspective",
      vfxScale: 0.03,
      vfxDuration: 3,
      isAnimationPlayOnClick: false
    },

    staticAssetLoader1: { componentType: "orthographic" },

    gltfLoader1: group("Scene model", {
      componentType: "perspective",
      assets: { terrain: model("glb/gameTerrain.glb.zip") }
    }),

    backgroundPlane1: group("Background plane", {
      componentType: "perspective",
      isEnabled: bool(false),
      backgroundDistance: 100,
      scale: num(1, { min: 0.1, max: 5, step: 0.01 }),
      xPositionOffset: num(0, { min: -50, max: 50, step: 0.1 }),
      yPositionOffset: num(0, { min: -50, max: 50, step: 0.1 }),
      assets: { background: image("background.jpg") }
    }),

    roundedTextBox1: group("In-game text box", {
      componentType: "orthographic",
      parentId: "canvas1",
      size: { portrait: { width: 0.8, height: 0.2 }, landscape: { width: 0.7, height: 0.2 } },
      position: pos(0.5, 0.8, 0.5, 0.85),
      color: color(0xffffff, { label: "Box color" }),
      alpha: 1,
      isBoxEnabled: bool(false),
      isTextEnabled: bool(false),
      localization: loc({
        caption: text(""),
        fontFamily: FONT,
        fontSize: fontSize(0.4),
        fontStyle: "500",
        fontColor: color("#FFFFFF"),
        origin: { x: 0.5, y: 0.5 }
      }),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -3,
      assets: { roundedBox: image("roundedBox.png") }
    }),

    vfxManager1: { componentType: "perspective" },

    tutorialHand1: group("In-game tutorial hand", {
      parentId: "canvas1",
      position: center,
      size: fullSize,
      positionOffset: center,
      handPosition: center,
      type: "tutorialHand",
      componentType: "orthographic",
      scale: unitScale(0.25, 0.25),
      origin: { x: 0.3, y: 0.9 },
      animationOption: "custom",
      depth: -1,
      ...handTimings,
      isEnabled: bool(true),
      isVisible: true,
      isInGameComponent: true,
      showingMoveTime: num(2, { min: 0, max: 20, step: 0.5, label: "Show after idle (s)" }),
      showingMoveCount: 1000,
      assets: {
        default: [image("hand.png", { variant: "normal" }), image("handGlow.png", { variant: "glow" })]
      }
    }),

    orthographicScene: { componentType: "orthographic" },

    backgroundMusic1: group("Music", {
      name: "BackgroundMusic",
      componentType: "perspective",
      volume: num(0.3, { min: 0, max: 1, step: 0.05 }),
      assets: { background: sound("sound/background.mp3") }
    }),

    ctaButton1: group("In-game CTA", {
      componentType: "orthographic",
      parentId: "canvas1",
      position: pos(0.75, 0.05, 0.85, 0.1),
      size: fullSize,
      scale: unitScale(0.35, 0.4),
      type: "ctaButton",
      localization: loc({
        caption: text("PLAY NOW"),
        fontFamily: FONT,
        fontSize: fontSize(0.35),
        fontStyle: "300",
        fontColor: color("#ffffff"),
        origin: { x: 0.5, y: 0.5 }
      }),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -5,
      scaleAnimationDurationInSeconds: seconds(0.75, 3),
      animationType: "scaleAnimation",
      isInGameComponent: true,
      delayInMilliseconds: 0,
      isAnimationEnabled: bool(true),
      assets: { ctaButton: image("inGameCTAButton.png") }
    }),

    inGameLogo1: group("In-game logo", {
      componentType: "orthographic",
      parentId: "canvas1",
      position: pos(0.2, 0.05, 0.15, 0.1),
      size: fullSize,
      scale: unitScale(0.25, 0.25),
      type: "button",
      depth: -5,
      isEnabled: bool(true),
      isOpenStoreEnabled: bool(true, { label: "Opens store on tap" }),
      assets: { logo: image("inGameLogo.png") }
    }),

    // #region End Card 1 (shown when the player loses)
    endCard1: {
      condition: "lost",
      componentType: "orthographic",
      position: center,
      size: fullSize,
      type: "endCard",
      logo1: "logo1",
      logo2: "logo2",
      dimmer: "dimmer2",
      hand: "tutorialHand2",
      background: "endCardBackground1",
      button: "ctaButton2",
      roundedTextBox: "roundedTextBox2",
      depth: -3
    },

    dimmer2: group("Lose end card › dimmer", {
      componentType: "orthographic",
      parentId: "endCard1",
      size: fullSize,
      scale: { portrait: 0.5, landscape: 0.5 },
      position: center,
      color: color(0x000000),
      alpha: "0.8",
      type: "dimmer",
      depth: -3
    }),

    logo1: group("Lose end card › logo 1", {
      componentType: "orthographic",
      parentId: "endCard1",
      position: pos(0.5, 0.15, 0.7, 0.4),
      size: fullSize,
      scale: unitScale(0.5, 0.6),
      type: "logo",
      depth: -2,
      animationType: "fadeIn",
      fadeInDurationInSeconds: 0.3,
      isEnabled: bool(true),
      assets: { logo: image("logo.png") }
    }),

    logo2: group("Lose end card › logo 2", {
      componentType: "orthographic",
      parentId: "endCard1",
      position: pos(0.5, 0.425, 0.25, 0.5),
      size: fullSize,
      scale: unitScale(0.75, 0.65),
      type: "logo",
      depth: -2,
      fadeInDurationInSeconds: 0.3,
      animationType: "fadeIn",
      isEnabled: bool(true),
      assets: { logo: image("logo2.png") }
    }),

    tutorialHand2: group("Lose end card › hand", {
      parentId: "ctaButton2",
      position: center,
      size: fullSize,
      positionOffset: center,
      handPosition: center,
      type: "tutorialHand",
      componentType: "orthographic",
      scale: unitScale(0.25, 0.15),
      origin: { x: 0.9, y: 0.9 },
      animationOption: "scaleAnimation",
      depth: -1,
      isInGameComponent: false,
      ...handTimings,
      isEnabled: bool(false),
      isVisible: false,
      assets: {
        default: [
          image("handEndCard.png", { variant: "normal" }),
          image("handEndCardGlow.png", { variant: "glow" })
        ]
      }
    }),

    endCardBackground1: group("Lose end card › background", {
      componentType: "orthographic",
      parentId: "endCard1",
      size: fullSize,
      scale: { portrait: 0.5, landscape: 0.5 },
      position: center,
      zoomPosition: center,
      zoom: { portrait: 1, landscape: 1 },
      depth: -4,
      isEnabled: bool(false),
      assets: { background: image("endCardBackground.jpg") }
    }),

    ctaButton2: group("Lose end card › CTA", {
      componentType: "orthographic",
      parentId: "endCard1",
      position: pos(0.51, 0.7, 0.8, 0.7),
      size: fullSize,
      scale: unitScale(0.425, 0.3),
      type: "ctaButton",
      scaleAnimationDurationInSeconds: 0.75,
      animationType: "scaleAnimation",
      localization: endCardLabel("PLAY NOW", 0.4, 0.48),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -2,
      hand: "tutorialHand2",
      delayInMilliseconds: 300,
      isVisible: false,
      isInGameComponent: false,
      isAnimationEnabled: bool(false),
      assets: { ctaButton: image("endCardCTAButton.png") }
    }),

    roundedTextBox2: group("Lose end card › title", {
      componentType: "orthographic",
      parentId: "endCard1",
      size: { portrait: { width: 0.8, height: 0.2 }, landscape: { width: 0.5, height: 0.2 } },
      position: pos(0.5, 0.65, 0.7, 0.55),
      color: color(0xffffff, { label: "Box color" }),
      alpha: 1,
      isBoxEnabled: bool(false),
      isTextEnabled: bool(false),
      localization: endCardLabel("YOU LOST", 1.25),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -3,
      assets: { roundedBox: image("roundedBox.png") }
    }),
    // #endregion

    // #region End Card 2 (shown when the player wins)
    endCard2: {
      condition: "won",
      componentType: "orthographic",
      position: center,
      size: fullSize,
      type: "endCard",
      logo1: "logo3",
      logo2: "logo4",
      dimmer: "dimmer3",
      hand: "tutorialHand3",
      background: "endCardBackground2",
      button: "ctaButton3",
      roundedTextBox: "roundedTextBox3",
      fadeInDurationInSeconds: 0.3,
      depth: -3
    },

    dimmer3: group("Win end card › dimmer", {
      componentType: "orthographic",
      parentId: "endCard2",
      size: fullSize,
      scale: { portrait: 0.5, landscape: 0.5 },
      position: center,
      color: color(0x000000),
      alpha: "0.8",
      type: "dimmer",
      depth: -3
    }),

    logo3: group("Win end card › logo 1", {
      componentType: "orthographic",
      parentId: "endCard2",
      position: pos(0.5, 0.25, 0.5, 0.25),
      size: fullSize,
      scale: unitScale(0.65, 0.6),
      type: "logo",
      depth: -2,
      animationType: "fadeIn",
      fadeInDurationInSeconds: 0.3,
      isEnabled: bool(true),
      assets: { logo: image("logo3.png") }
    }),

    logo4: group("Win end card › logo 2", {
      componentType: "orthographic",
      parentId: "endCard2",
      position: pos(0.5, 0.85, 0.5, 0.78),
      size: fullSize,
      scale: unitScale(0.75, 0.65),
      type: "logo",
      depth: -2,
      animationType: "fadeIn",
      fadeInDurationInSeconds: 0.3,
      isEnabled: bool(true),
      assets: { logo: image("logo4.png") }
    }),

    tutorialHand3: group("Win end card › hand", {
      parentId: "ctaButton3",
      position: center,
      size: fullSize,
      positionOffset: { portrait: { x: 0.4, y: 0.5 }, landscape: { x: 0.4, y: 0.5 } },
      handPosition: center,
      type: "tutorialHand",
      componentType: "orthographic",
      scale: unitScale(0.25, 0.15),
      origin: { x: 0.225, y: 0.9 },
      animationOption: "scaleAnimation",
      depth: -1,
      isInGameComponent: false,
      ...handTimings,
      isEnabled: bool(true),
      isVisible: false,
      assets: {
        default: [
          image("handEndCard2.png", { variant: "normal" }),
          image("handEndCardGlow2.png", { variant: "glow" })
        ]
      }
    }),

    endCardBackground2: group("Win end card › background", {
      componentType: "orthographic",
      parentId: "endCard2",
      size: fullSize,
      scale: { portrait: 0.5, landscape: 0.5 },
      position: center,
      zoomPosition: center,
      zoom: { portrait: 1, landscape: 1 },
      depth: -4,
      isEnabled: bool(false),
      assets: { background: image("endCardBackground2.jpg") }
    }),

    ctaButton3: group("Win end card › CTA", {
      componentType: "orthographic",
      parentId: "endCard2",
      position: pos(0.5, 0.55, 0.5, 0.55),
      size: fullSize,
      scale: unitScale(0.5, 0.45),
      scaleAnimationDurationInSeconds: 0.75,
      animationType: "scaleAnimation",
      type: "ctaButton",
      localization: endCardLabel("PLAY NOW", 0.4, 0.48),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -2,
      hand: "tutorialHand3",
      delayInMilliseconds: 300,
      isVisible: false,
      isInGameComponent: false,
      isAnimationEnabled: bool(false),
      assets: { ctaButton: image("endCardCTAButton2.png") }
    }),

    roundedTextBox3: group("Win end card › footer text", {
      componentType: "orthographic",
      parentId: "endCard2",
      size: { portrait: { width: 1, height: 0.15 }, landscape: { width: 0.9, height: 0.2 } },
      position: pos(0.5, 0.94, 0.5, 0.92),
      color: color(0xff0000, { label: "Box color" }),
      alpha: 1,
      isBoxEnabled: bool(false),
      isTextEnabled: bool(true),
      localization: endCardLabel("©2025 PLACEHOLDER TRADEMARK TEXT", 0.5),
      textSizeMultiplier: { x: 2, y: 2 },
      depth: -3,
      assets: { roundedBox: image("roundedBox.png") }
    }),
    // #endregion

    soundPlayer1: {
      name: "SoundPlayer",
      componentType: "perspective",
      soundFxVolumeManagerId: "soundFxVolumeManager1",
      assets: { blank_sound: sound("sound/blank_sound.mp3") }
    },

    directionalLight1: group("Directional light", {
      componentType: "perspective",
      color: color("#ffffff"),
      intensity: num(1, { min: 0, max: 10, step: 0.1 }),
      position: { x: 0, y: 4, z: 1 },
      lookAtCoordinates: { x: 0, y: 0, z: 0 },
      castShadow: true,
      shadow: {
        camera: { far: 50, near: 0.5, left: -10, right: 10, top: 13, bottom: -13 },
        mapSize: { width: 2048, height: 2048 },
        bias: -0.005
      }
    }),

    orthographicCamera: {
      componentType: "orthographic",
      position: { z: 20 }
    },

    canvas1: {
      componentType: "orthographic",
      canvasSize: "fill",
      banner: "banner1",
      position: center,
      size: fullSize
    },

    banner1: group("Top banner", {
      componentType: "orthographic",
      dock: "top",
      position: center,
      size: { portrait: { width: 1, height: 0.075 }, landscape: { width: 1, height: 0.1 } },
      type: "banner",
      color: color(0xffffff, { label: "Banner color" }),
      depth: -5,
      alpha: 1,
      localization: loc({
        caption: text("Only 1% Can Pass This Level"),
        fontFamily: FONT,
        fontSize: fontSize(0.49),
        fontStyle: "500",
        fontColor: color("#000000"),
        origin: { x: 0.5, y: 0.33 }
      })
    }),

    soundFxVolumeManager1: group("Sound effects", {
      componentType: "perspective",
      volume: num(1, { min: 0, max: 1, step: 0.05 })
    }),

    fontUploader1: {
      componentType: "perspective",
      type: "fontUploader",
      fonts: { font1: { fontFamily: FONT, source: font("fonts/ClashDisplay-Bold.woff") } }
    }
  },

  options: {
    link: {
      android: text("https://playin.com.tr/", { label: "Google Play URL" }),
      ios: text("https://playin.com.tr/", { label: "App Store URL" })
    },
    isEndCardEnabled: bool(true),
    endCardSeconds: num(0, { min: 0, max: 120, step: 1, label: "End card after seconds (0 = off)" }),
    endCardTaps: num(0, { min: 0, max: 100, step: 1, label: "End card after taps (0 = off)" }),
    endCardMoves: num(0, { min: 0, max: 100, step: 1, label: "End card after moves (0 = off)" }),
    endCardDelay: seconds(0.5, 5),
    isSoundEnabled: bool(true),
    isTutorialEnabled: bool(true),
    isEntireScreenCTAEnabled: bool(true),
    isBannerEnabled: bool(false),
    // "auto" picks the device language among the languages that have texts.
    language: language("auto"),
    isInGameCTAEnabled: bool(true),
    goToMarketTaps: num(0, { min: 0, max: 100, step: 1, label: "Open store after taps (0 = off)" }),
    isGoToMarketEnabled: bool(false),
    goToMarketSeconds: num(0, { min: 0, max: 120, step: 1, label: "Open store after seconds (0 = off)" }),
    showEndCardAfterMarket: bool(true),
    // Dev only: the scene debugger is never part of a production build.
    isSceneDebuggerEnabled: true
  }
});
