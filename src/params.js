// Game configuration.
//
// Values wrapped in num / bool / color / text / image are editable from the dev panel.
// Plain values are fixed. The playable ad widgets (CTA, end card, banner, store links)
// are intentionally absent: this build is a web game.

import { defineConfig, group, loc, num, bool, color, text, language, image } from "../playable/kit/fields.js";

export default defineConfig({
  components: {
    perspectiveScene: {
      componentType: "perspective",
      background: { isTexture: false, color: color(0x120c09, { label: "Background color" }) }
    },

    ambientLight1: group("Ambient light", {
      componentType: "perspective",
      color: color(0xffd9b0),
      intensity: num(0.1, { min: 0, max: 10, step: 0.05 })
    }),

    directionalLight1: group("Directional light", {
      componentType: "perspective",
      color: color("#ffd6a8"),
      intensity: num(0.95, { min: 0, max: 10, step: 0.05 }),
      position: { x: 4, y: 8, z: 5 },
      lookAtCoordinates: { x: 0, y: 0, z: 0 },
      castShadow: false
    }),

    perspectiveCamera: group("Camera", {
      componentType: "perspective",
      fov: num(42, { min: 10, max: 120, step: 1 }),
      near: 0.1,
      far: 100,
      position: { x: 0, y: 6, z: 8 },
      lookAtCoordinates: { x: 0, y: 0.2, z: 0 },
      useGltfCamera: false,
      refFov: num(42, { min: 10, max: 120, step: 1, label: "Reference FOV" }),
      refAspect: 0.75,
      orthoPortraitViewSize: 14,
      orthoLandscapeViewSize: 24
    }),

    // Title plus one image so a variant can still swap or disable an asset.
    // The table itself is built in code; this backdrop is not drawn.
    studio: group("Title", {
      componentType: "perspective",
      isEnabled: bool(true),
      localization: loc({
        caption: text("Pigment")
      }),
      assets: { backdrop: image("background.jpg") }
    }),

    // Pointing hand of the level-1 tutorial: Openclipart #177491 (public domain), recoloured.
    tutorialHand: group("Tutorial hand", {
      componentType: "perspective",
      assets: { hand: image("tutorialHand.png") }
    }),

    orthographicScene: { componentType: "orthographic" },

    orthographicCamera: {
      componentType: "orthographic",
      position: { z: 20 }
    }
  },

  options: {
    isSoundEnabled: bool(true),
    language: language("auto"),
    isSceneDebuggerEnabled: true
  }
});
