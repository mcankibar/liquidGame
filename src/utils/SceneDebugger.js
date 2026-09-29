/**
 * SceneDebugger — Three.js editor-style debug panel.
 *
 * Features:
 *  • Camera controls  (position, rotation, FOV)
 *  • Camera switch    (built-in ↔ GLB camera)
 *  • Grid helper      (on/off)
 *  • Object picker    (all meshes/groups in the perspective scene)
 *  • Transform gizmo  (TransformControls — translate / rotate / scale)
 *  • Lights panel     (ambient + directional: color, intensity, position)
 *  • FPS counter
 *
 * Keyboard shortcuts:  ` → toggle visibility | W/E/R → gizmo mode
 *
 * NEVER imported in production builds — call site is guarded by:
 *   if (!process.env.BUILD_MODE) { ... }
 * Webpack's DefinePlugin + dead-code elimination removes it entirely.
 */

import { Pane } from "tweakpane";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

// ─── CSS injected once ───────────────────────────────────────────────────────
let _cssInjected = false;
function _injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .sd-wrap {
      position: fixed;
      top: 0; right: 0;
      width: 300px;
      height: 100vh;
      display: flex;
      flex-direction: row;
      overflow: hidden;
      z-index: 9999;
      pointer-events: none;
    }
    .sd-resize-handle {
      flex: 0 0 6px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.15s;
      pointer-events: auto;
    }
    .sd-resize-handle:hover,
    .sd-resize-handle.dragging { background: rgba(99,179,255,0.35); }
    .sd-inner {
      flex: 1 1 0;
      min-height: 0;        /* critical: lets flex child shrink & scroll */
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      background: rgba(18, 18, 22, 0.82);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border-left: 1px solid rgba(255,255,255,0.08);
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      scrollbar-width: thin;
      scrollbar-color: #444 transparent;
      pointer-events: auto;
    }
    .sd-wrap { --tp-base-background-color: rgba(18,18,22,0); }
    .sd-inner .tp-rotv { border-radius: 0; background: transparent; }
    .sd-inner .tp-rotv_b { background: rgba(255,255,255,0.06); }
    .sd-fps { font-size: 11px; color: #aaa; padding: 4px 8px 2px; font-family: monospace; }
    .sd-shortcut { font-size: 10px; color: #555; padding: 0 8px 8px; font-family: monospace; }
  `;
  document.head.appendChild(style);
}

export class SceneDebugger {
  /**
   * @param {object} opts
   * @param {THREE.Scene}             opts.scene
   * @param {THREE.WebGLRenderer}     opts.renderer
   * @param {THREE.PerspectiveCamera} opts.perspectiveCamera
   * @param {object}                  opts.perspectiveCameraComponent
   * @param {object}                  opts.components             – Game.components Map
   * @param {object}                  [opts.gltfLoaderComponent]  – GLTFLoaderComponent (for animations)
   * @param {() => THREE.Camera}      opts.getActiveCamera
   * @param {() => void}              opts.onCameraSwitch
   */
  constructor({
    scene,
    renderer,
    perspectiveCamera,
    perspectiveCameraComponent,
    components,
    gltfLoaderComponent,
    getActiveCamera,
    onCameraSwitch
  }) {
    this._scene = scene;
    this._renderer = renderer;
    this._perspCam = perspectiveCamera;
    this._perspCamComp = perspectiveCameraComponent;
    this._components = components;
    this._gltfLoader = gltfLoaderComponent ?? null;
    this._getActiveCamera = getActiveCamera;
    this._onCameraSwitch = onCameraSwitch;

    this._visible = true;
    this._selectedObject = null;
    this._grid = null;
    this._transformControls = null;
    this._transformMode = "translate";
    this._objectTransformFolder = null;
    this._objectsFolder = null;
    this._lightsFolder = null;
    this._animFolder = null;
    this._objectList = [];
    this._modeState = null;
    this._initialCameraState = null;
    this._initialObjectStates = new Map();

    // Directional light helpers and gizmos
    this._dirLightHelpers = new Map();
    this._dirLightTC = null;
    this._dirLightTargetTC = null;

    // Animation player state
    this._mixer = null;
    this._activeAction = null;
    this._animTimeState = null;
    this._animClock = new THREE.Clock(); // independent clock for mixer

    // FPS tracking
    this._fps = 0;
    this._fpsFrames = 0;
    this._fpsLast = performance.now();

    _injectCSS();
    this._initPane();
    this._initTransformControls();
    this._bindKeyboard();
  }

  // ─── Initialisation ──────────────────────────────────────────────────────

  _initPane() {
    this._pane = new Pane({ title: "⚙  Scene Debugger", expanded: true });

    // Outer wrapper (handles resize, no scrolling)
    const originalWrap = this._pane.element.parentElement;
    this._wrap = document.createElement("div");
    this._wrap.className = "sd-wrap";
    document.body.appendChild(this._wrap);

    // Inner scrollable container
    this._inner = document.createElement("div");
    this._inner.className = "sd-inner";
    this._wrap.appendChild(this._inner);

    // Block pointer/touch/wheel events leaking to canvas behind the panel
    this._inner.addEventListener("pointerdown", (e) => e.stopPropagation());
    this._inner.addEventListener("pointermove", (e) => e.stopPropagation());
    this._inner.addEventListener("pointerup", (e) => e.stopPropagation());
    this._inner.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: false });
    this._inner.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: false });
    this._inner.addEventListener("touchend", (e) => e.stopPropagation());
    // passive:true → no preventDefault, native scroll works; stopPropagation prevents canvas zoom
    this._inner.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

    // Move pane into inner
    this._inner.appendChild(this._pane.element);
    originalWrap.style.display = "none";

    // FPS + shortcut hints (above pane element)
    this._fpsEl = document.createElement("div");
    this._fpsEl.className = "sd-fps";
    this._fpsEl.textContent = "FPS: —";
    this._inner.insertBefore(this._fpsEl, this._pane.element);

    const hint = document.createElement("div");
    hint.className = "sd-shortcut";
    hint.textContent = "O  toggle  |  W translate  |  E rotate  |  R scale";
    this._inner.insertBefore(hint, this._pane.element);

    this._buildSceneFolder();
    this._buildCameraFolder();
    this._buildLightsFolder();
    this._buildObjectsFolder();
    this._buildAnimationsFolder();
    this._initResizeHandle();
  }

  // ─── Resize handle ───────────────────────────────────────────────────────

  _initResizeHandle() {
    const handle = document.createElement("div");
    handle.className = "sd-resize-handle";
    this._wrap.insertBefore(handle, this._inner); // must be first child (left side in flex row)

    let startX = 0,
      startWidth = 0;

    const onMove = (e) => {
      const dx = startX - e.clientX; // dragging left = larger panel
      const newW = Math.max(220, Math.min(700, startWidth + dx));
      this._wrap.style.width = `${newW}px`;
    };
    const onUp = (e) => {
      handle.classList.remove("dragging");
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startWidth = this._wrap.offsetWidth;
      handle.setPointerCapture(e.pointerId); // track even outside window
      handle.classList.add("dragging");
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  _initTransformControls() {
    const cam = this._getActiveCamera();
    this._transformControls = new TransformControls(cam, this._renderer.domElement);
    this._transformControls.setMode(this._transformMode);
    this._transformControls.addEventListener("change", () => this._pane.refresh());
    this._scene.add(this._transformControls);
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "o" || e.key === "O") {
        this._toggleVisibility();
        return;
      }
      if (!this._selectedObject) return;
      if (e.key === "w") this._setTransformMode("translate");
      if (e.key === "e") this._setTransformMode("rotate");
      if (e.key === "r") this._setTransformMode("scale");
    });
  }

  // ─── Scene Folder ────────────────────────────────────────────────────────

  _buildSceneFolder() {
    const f = this._pane.addFolder({ title: "🌐  Scene", expanded: false });
    const state = { grid: false };
    f.addBinding(state, "grid", { label: "Grid Helper" }).on("change", ({ value }) => this._toggleGrid(value));
  }

  // ─── Camera Folder ───────────────────────────────────────────────────────

  _buildCameraFolder() {
    const cam = this._perspCam;
    const f = this._pane.addFolder({ title: "📷  Camera (built-in)", expanded: true });

    // Snapshot initial state the first time this is built (before any user edits)
    if (!this._initialCameraState) {
      this._initialCameraState = {
        position: cam.position.clone(),
        rotation: cam.rotation.clone(),
        fov: cam.fov
      };
    }

    const posF = f.addFolder({ title: "Position", expanded: true });
    posF.addBinding(cam.position, "x", { label: "X", min: -200, max: 200, step: 0.01 });
    posF.addBinding(cam.position, "y", { label: "Y", min: -200, max: 200, step: 0.01 });
    posF.addBinding(cam.position, "z", { label: "Z", min: -200, max: 200, step: 0.01 });

    const rotDeg = {
      x: THREE.MathUtils.radToDeg(cam.rotation.x),
      y: THREE.MathUtils.radToDeg(cam.rotation.y),
      z: THREE.MathUtils.radToDeg(cam.rotation.z)
    };
    const rotF = f.addFolder({ title: "Rotation (°)", expanded: false });
    ["x", "y", "z"].forEach((axis) => {
      rotF
        .addBinding(rotDeg, axis, { label: axis.toUpperCase(), min: -180, max: 180, step: 0.1 })
        .on("change", ({ value }) => {
          cam.rotation[axis] = THREE.MathUtils.degToRad(value);
        });
    });

    f.addBinding(cam, "fov", { label: "FOV", min: 5, max: 120, step: 0.5 }).on("change", () => {
      cam.updateProjectionMatrix();
      if (this._perspCamComp) this._perspCamComp.fov = cam.fov;
    });

    f.addButton({ title: "↺  Reset Camera" }).on("click", () => {
      const s = this._initialCameraState;
      cam.position.copy(s.position);
      cam.rotation.copy(s.rotation);
      cam.fov = s.fov;
      cam.updateProjectionMatrix();
      if (this._perspCamComp) this._perspCamComp.fov = cam.fov;
      this._pane.refresh();
    });

    if (this._onCameraSwitch) {
      f.addButton({ title: "⇄  Toggle GLB / Built-in Camera" }).on("click", () => {
        this._onCameraSwitch();
        if (this._transformControls) this._transformControls.camera = this._getActiveCamera();
      });
    }
  }

  // ─── Lights Folder ───────────────────────────────────────────────────────

  /**
   * Builds the lights panel from the components Map rather than traversing the
   * scene — because at SceneDebugger construction time the lights may not have
   * been rendered (added to the scene) yet.
   */
  _buildLightsFolder() {
    // Remove old helpers before rebuilding
    this._dirLightHelpers?.forEach((helper) => {
      this._scene.remove(helper);
      helper.dispose();
    });
    this._dirLightHelpers?.clear();
    if (this._dirLightTC) this._dirLightTC.detach();
    if (this._dirLightTargetTC) this._dirLightTargetTC.detach();

    if (this._lightsFolder) {
      this._lightsFolder.dispose();
      this._lightsFolder = null;
    }
    const f = this._pane.addFolder({ title: "💡  Lights", expanded: false });
    this._lightsFolder = f;
    let foundAny = false;

    this._components.forEach((comp) => {
      // AmbientLight component stores its Three.js object on .ambientLight
      if (comp.ambientLight) {
        foundAny = true;
        this._buildAmbientBindings(f, comp.ambientLight, comp.componentId);
      }
      // DirectionalLight component exposes it via .get()
      const dl = typeof comp.get === "function" && comp.get();
      if (dl && dl.isDirectionalLight) {
        foundAny = true;
        this._buildDirectionalBindings(f, dl, comp.componentId);
      }
    });

    if (!foundAny) {
      f.addBinding({ info: "No lights in components" }, "info", { readonly: true });
    }
  }

  _buildDirectionalBindings(parent, light, id) {
    const lf = parent.addFolder({ title: `Directional: ${id}`, expanded: true });
    const state = { color: `#${light.color.getHexString()}` };
    lf.addBinding(state, "color", { view: "color", label: "Color" }).on("change", ({ value }) => {
      light.color.set(value);
      this._dirLightHelpers.get(light.uuid)?.update();
    });
    lf.addBinding(light, "intensity", { label: "Intensity", min: 0, max: 10, step: 0.01 });

    const updateHelper = () => this._dirLightHelpers.get(light.uuid)?.update();

    const posF = lf.addFolder({ title: "Position", expanded: true });
    posF.addBinding(light.position, "x", { label: "X", min: -50, max: 50, step: 0.1 }).on("change", updateHelper);
    posF.addBinding(light.position, "y", { label: "Y", min: -50, max: 50, step: 0.1 }).on("change", updateHelper);
    posF.addBinding(light.position, "z", { label: "Z", min: -50, max: 50, step: 0.1 }).on("change", updateHelper);

    // Ensure the light target is in the scene so target.position changes take effect
    if (!light.target.parent) this._scene.add(light.target);

    const targetF = lf.addFolder({ title: "Target (LookAt)", expanded: true });
    const updateTarget = () => {
      light.target.updateMatrixWorld();
      this._dirLightHelpers.get(light.uuid)?.update();
    };
    targetF
      .addBinding(light.target.position, "x", { label: "X", min: -50, max: 50, step: 0.1 })
      .on("change", updateTarget);
    targetF
      .addBinding(light.target.position, "y", { label: "Y", min: -50, max: 50, step: 0.1 })
      .on("change", updateTarget);
    targetF
      .addBinding(light.target.position, "z", { label: "Z", min: -50, max: 50, step: 0.1 })
      .on("change", updateTarget);

    const targetGizmoState = { gizmo: false };
    targetF.addBinding(targetGizmoState, "gizmo", { label: "Show Gizmo" }).on("change", ({ value }) => {
      if (value) {
        if (!this._dirLightTargetTC) {
          this._dirLightTargetTC = new TransformControls(this._getActiveCamera(), this._renderer.domElement);
          this._dirLightTargetTC.setMode("translate");
          this._dirLightTargetTC.addEventListener("change", () => {
            light.target.updateMatrixWorld();
            this._pane.refresh();
            this._dirLightHelpers.forEach((h) => {
              if (h.visible) h.update();
            });
          });
          this._dirLightTargetTC.addEventListener("dragging-changed", (e) => {
            if (this._renderer.domElement.__orbitControls) {
              this._renderer.domElement.__orbitControls.enabled = !e.value;
            }
          });
          this._scene.add(this._dirLightTargetTC);
        }
        this._dirLightTargetTC.attach(light.target);
      } else {
        if (this._dirLightTargetTC) this._dirLightTargetTC.detach();
      }
    });

    // Directional light gizmo
    const helper = new THREE.DirectionalLightHelper(light, 1);
    helper.visible = false;
    this._scene.add(helper);
    this._dirLightHelpers.set(light.uuid, helper);

    const helperState = { gizmo: false };
    lf.addBinding(helperState, "gizmo", { label: "Show Gizmo" }).on("change", ({ value }) => {
      helper.visible = value;
      if (value) {
        helper.update();
        // Create dedicated TransformControls for directional lights (lazy, once)
        if (!this._dirLightTC) {
          this._dirLightTC = new TransformControls(this._getActiveCamera(), this._renderer.domElement);
          this._dirLightTC.setMode("translate");
          this._dirLightTC.addEventListener("change", () => {
            this._pane.refresh();
            this._dirLightHelpers.forEach((h) => {
              if (h.visible) h.update();
            });
          });
          // Prevent dragging the gizmo from also moving objects via orbitControls / game input
          this._dirLightTC.addEventListener("dragging-changed", (e) => {
            if (this._renderer.domElement.__orbitControls) {
              this._renderer.domElement.__orbitControls.enabled = !e.value;
            }
          });
          this._scene.add(this._dirLightTC);
        }
        this._dirLightTC.attach(light);
      } else {
        if (this._dirLightTC) this._dirLightTC.detach();
      }
    });

    lf.addButton({ title: "⊙  Focus camera" }).on("click", () => {
      const cam = this._perspCam;
      const target = light.position.clone();
      // Back the camera off along its current direction; fall back to a 45° offset
      let dir = cam.position.clone().sub(target);
      if (dir.length() < 0.001) dir.set(1, 1, 1);
      dir.normalize().multiplyScalar(5);
      cam.position.copy(target.clone().add(dir));
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      this._pane.refresh();
    });
  }

  _buildAmbientBindings(parent, light, id) {
    const lf = parent.addFolder({ title: `Ambient: ${id}`, expanded: true });
    const state = { color: `#${light.color.getHexString()}` };
    lf.addBinding(state, "color", { view: "color", label: "Color" }).on("change", ({ value }) =>
      light.color.set(value)
    );
    lf.addBinding(light, "intensity", { label: "Intensity", min: 0, max: 10, step: 0.01 });
  }

  // ─── Objects Folder ──────────────────────────────────────────────────────

  // ─── Object hierarchy helpers ────────────────────────────────────────────

  /** Returns true if this node (or any descendant) is renderable/selectable. */
  _isNodeRelevant(obj) {
    if (obj.isLight || obj.isCamera) return false;
    if (obj === this._grid || obj === this._transformControls) return false;
    return true;
  }

  /** Returns true if the node itself or any descendant passes _isNodeRelevant AND is renderable/selectable. */
  _hasVisibleDescendant(obj) {
    if (!this._isNodeRelevant(obj)) return false;
    if (obj.isMesh) return true; // leaf mesh
    if (obj.children.length > 0)
      // any container
      return obj.children.some((c) => this._hasVisibleDescendant(c));
    return false;
  }

  /**
   * Recursively builds TweakPane folders mirroring the scene graph.
   * Leaf nodes → single button (click = select).
   * Branch nodes → collapsible folder with a compact "Select" button + children.
   * Focus is available in the Transform panel after selection.
   */
  _buildNodeTree(parent, obj) {
    if (!this._isNodeRelevant(obj)) return;

    const relevantChildren = obj.children.filter((c) => this._hasVisibleDescendant(c));
    const name = obj.name || obj.type;
    const icon = obj.isMesh ? "◈" : "▸";

    if (relevantChildren.length === 0) {
      // Leaf node — single selectable button
      parent.addButton({ title: `${icon}  ${name}` }).on("click", () => this._selectObject(obj));
      this._objectList.push(obj);
    } else {
      // Branch node — folder; first child is a compact Select button
      const folder = parent.addFolder({ title: `${icon}  ${name}`, expanded: false });
      folder.addButton({ title: "Select" }).on("click", () => this._selectObject(obj));
      this._objectList.push(obj);
      relevantChildren.forEach((c) => this._buildNodeTree(folder, c));
    }
  }

  _buildObjectsFolder() {
    if (this._objectsFolder) {
      this._objectsFolder.dispose();
      this._objectsFolder = null;
    }
    const f = this._pane.addFolder({ title: "📦  Objects", expanded: false });
    this._objectsFolder = f;
    this._objectList = [];

    // Gizmo mode at the top
    const modeState = { mode: this._transformMode };
    this._modeState = modeState;
    f.addBinding(modeState, "mode", {
      label: "Gizmo  (W/E/R)",
      options: { Translate: "translate", Rotate: "rotate", Scale: "scale" }
    }).on("change", ({ value }) => this._setTransformMode(value));

    // Build hierarchy from scene root's direct children
    const roots = this._scene.children.filter((c) => this._hasVisibleDescendant(c));
    if (roots.length === 0) {
      f.addBinding({ status: "(empty — call refresh() after scene loads)" }, "status", { readonly: true, label: "" });
      return;
    }
    roots.forEach((child) => this._buildNodeTree(f, child));

    // Transform panel — populated when an object is selected
    this._objectTransformFolder = f.addFolder({ title: "Transform", expanded: true });
  }

  _selectObject(obj) {
    this._selectedObject = obj;
    // Store initial transform the first time this object is selected
    if (!this._initialObjectStates.has(obj.uuid)) {
      this._initialObjectStates.set(obj.uuid, {
        position: obj.position.clone(),
        rotation: obj.rotation.clone(),
        scale: obj.scale.clone()
      });
    }
    if (this._transformControls) this._transformControls.attach(obj);
    this._refreshObjectTransform();
  }

  /**
   * Moves the built-in perspective camera to frame the given object.
   * Computes the bounding sphere of the object + all its descendants,
   * then backs the camera up along its current direction so the object fills
   * roughly half the view.
   */
  _focusObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    const cam = this._perspCam;
    // Compute required distance so the object fits in the frustum
    const fovRad = THREE.MathUtils.degToRad(cam.fov);
    const distance = Math.max((maxDim / 2 / Math.tan(fovRad / 2)) * 1.5, 0.5);

    // Keep current direction relative to object center; fall back to a 45° angle
    let dir = cam.position.clone().sub(center);
    if (dir.length() < 0.001) dir.set(0.5, 0.5, 1);
    dir.normalize().multiplyScalar(distance);

    cam.position.copy(center.clone().add(dir));
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    this._pane.refresh();
  }

  _refreshObjectTransform() {
    const tf = this._objectTransformFolder;
    if (!tf || !this._selectedObject) return;
    [...tf.children].forEach((c) => c.dispose());

    const obj = this._selectedObject;
    const label = obj.name || obj.type;

    // ↺ Reset  |  ⊙ Focus  — two action buttons at the top
    tf.addButton({ title: `↺  Reset  —  ${label}` }).on("click", () => {
      const s = this._initialObjectStates.get(obj.uuid);
      if (!s) return;
      obj.position.copy(s.position);
      obj.rotation.copy(s.rotation);
      obj.scale.copy(s.scale);
      this._refreshObjectTransform();
      this._pane.refresh();
    });
    tf.addButton({ title: "⊙  Focus camera" }).on("click", () => this._focusObject(obj));

    const posF = tf.addFolder({ title: `${label} — Position`, expanded: true });
    posF.addBinding(obj.position, "x", { label: "X", min: -200, max: 200, step: 0.001 });
    posF.addBinding(obj.position, "y", { label: "Y", min: -200, max: 200, step: 0.001 });
    posF.addBinding(obj.position, "z", { label: "Z", min: -200, max: 200, step: 0.001 });

    const rotDeg = {
      x: THREE.MathUtils.radToDeg(obj.rotation.x),
      y: THREE.MathUtils.radToDeg(obj.rotation.y),
      z: THREE.MathUtils.radToDeg(obj.rotation.z)
    };
    const rotF = tf.addFolder({ title: "Rotation (°)", expanded: false });
    ["x", "y", "z"].forEach((axis) => {
      rotF
        .addBinding(rotDeg, axis, { label: axis.toUpperCase(), min: -360, max: 360, step: 0.1 })
        .on("change", ({ value }) => {
          obj.rotation[axis] = THREE.MathUtils.degToRad(value);
        });
    });

    const scaleF = tf.addFolder({ title: "Scale", expanded: false });
    scaleF.addBinding(obj.scale, "x", { label: "X", min: 0.001, max: 20, step: 0.001 });
    scaleF.addBinding(obj.scale, "y", { label: "Y", min: 0.001, max: 20, step: 0.001 });
    scaleF.addBinding(obj.scale, "z", { label: "Z", min: 0.001, max: 20, step: 0.001 });
  }

  // ─── Animations Folder ───────────────────────────────────────────────────

  _buildAnimationsFolder() {
    if (this._animFolder) {
      this._animFolder.dispose();
      this._animFolder = null;
    }

    const clips = this._gltfLoader?.animations ?? [];
    const f = this._pane.addFolder({ title: "🎥  Animations", expanded: false });
    this._animFolder = f;

    if (clips.length === 0) {
      f.addBinding({ info: "No animations in GLB" }, "info", { readonly: true, label: "" });
      return;
    }

    // Lazily create mixer (root = gltf scene or fallback to perspScene)
    if (!this._mixer) {
      const root = this._gltfLoader.gltf?.scene ?? this._scene;
      this._mixer = new THREE.AnimationMixer(root);
    }

    // Clip selector
    const clipOpts = {};
    clips.forEach((c, i) => {
      clipOpts[c.name || `Clip ${i}`] = i;
    });
    const clipState = { idx: 0 };
    f.addBinding(clipState, "idx", { label: "Clip", options: clipOpts }).on("change", () => this._stopAnim());

    // Transport row
    f.addButton({ title: "▶  Play" }).on("click", () => this._playAnim(clips[clipState.idx]));
    f.addButton({ title: "⏸  Pause" }).on("click", () => this._pauseAnim());
    f.addButton({ title: "⏹  Stop" }).on("click", () => this._stopAnim());

    // Speed
    const speedState = { speed: 1.0 };
    f.addBinding(speedState, "speed", { label: "Speed", min: 0.1, max: 3, step: 0.05 }).on("change", ({ value }) => {
      if (this._mixer) this._mixer.timeScale = value;
    });

    // Time readout — updated every tick
    this._animTimeState = { time: "0.00 s" };
    f.addBinding(this._animTimeState, "time", { readonly: true, label: "Time" });
  }

  _playAnim(clip) {
    if (!this._mixer || !clip) return;
    if (this._activeAction && this._activeAction.isRunning() && this._activeAction.paused) {
      // Resume paused playback
      this._activeAction.paused = false;
      return;
    }
    if (this._activeAction) this._activeAction.stop();
    this._activeAction = this._mixer.clipAction(clip);
    this._activeAction.reset().play();
    this._animClock.start();
  }

  _pauseAnim() {
    if (!this._activeAction) return;
    this._activeAction.paused = !this._activeAction.paused;
  }

  _stopAnim() {
    if (this._activeAction) {
      this._activeAction.stop();
      this._activeAction = null;
    }
    if (this._mixer) this._mixer.setTime(0);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _toggleGrid(enabled) {
    if (enabled && !this._grid) {
      this._grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
      this._scene.add(this._grid);
    } else if (!enabled && this._grid) {
      this._scene.remove(this._grid);
      this._grid = null;
    }
  }

  _setTransformMode(mode) {
    this._transformMode = mode;
    if (this._transformControls) this._transformControls.setMode(mode);
    if (this._modeState) {
      this._modeState.mode = mode;
      this._pane.refresh();
    }
  }

  _toggleVisibility() {
    this._visible = !this._visible;
    this._wrap.style.display = this._visible ? "" : "none";
    if (this._transformControls) this._transformControls.visible = this._visible;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Call after renderComponents() so the objects list picks up scene objects
   * and the lights folder can resolve component references.
   */
  refresh() {
    this._buildLightsFolder();
    this._buildObjectsFolder();
    this._buildAnimationsFolder();
  }

  /** Tick — call once per frame inside the render loop to update the FPS counter and animation mixer. */
  tick() {
    // FPS
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._fpsLast >= 500) {
      this._fps = Math.round(this._fpsFrames / ((now - this._fpsLast) / 1000));
      this._fpsFrames = 0;
      this._fpsLast = now;
      this._fpsEl.textContent = `FPS: ${this._fps}`;
    }
    // Directional light helpers
    this._dirLightHelpers?.forEach((helper) => {
      if (helper.visible) helper.update();
    });

    // Animation mixer
    if (this._mixer && this._activeAction && !this._activeAction.paused) {
      this._mixer.update(this._animClock.getDelta());
      if (this._animTimeState) {
        this._animTimeState.time = `${this._mixer.time.toFixed(2)} s`;
        this._pane.refresh();
      }
    }
  }

  dispose() {
    this._stopAnim();
    if (this._mixer) {
      this._mixer.stopAllAction();
      this._mixer = null;
    }
    this._pane?.dispose();
    if (this._transformControls) {
      this._transformControls.detach();
      this._scene.remove(this._transformControls);
      this._transformControls.dispose();
    }
    if (this._dirLightTC) {
      this._dirLightTC.detach();
      this._scene.remove(this._dirLightTC);
      this._dirLightTC.dispose();
      this._dirLightTC = null;
    }
    if (this._dirLightTargetTC) {
      this._dirLightTargetTC.detach();
      this._scene.remove(this._dirLightTargetTC);
      this._dirLightTargetTC.dispose();
      this._dirLightTargetTC = null;
    }
    if (this._grid) this._scene.remove(this._grid);
    this._dirLightHelpers?.forEach((helper) => {
      this._scene.remove(helper);
      helper.dispose();
    });
    this._dirLightHelpers?.clear();
    if (this._wrap) this._wrap.remove();
  }
}
