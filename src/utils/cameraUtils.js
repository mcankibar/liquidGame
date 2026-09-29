import * as THREE from "three";

// Module-level vector reused every frame to avoid per-frame allocations.
const _rendererSize = new THREE.Vector2();

// ─── FOV ──────────────────────────────────────────────────────────────────────

/**
 * Computes the vertical FOV (degrees) that keeps horizontal scene coverage
 * constant across all aspect ratios.
 *
 *   tan(vFov/2) = tan(hFov/2) / aspect
 *   tan(hFov/2) = tan(refVFov/2) * refAspect
 *
 * @param {number} w         - viewport width
 * @param {number} h         - viewport height
 * @param {number} refFov    - vertical FOV (°) that looks correct at refAspect
 * @param {number} refAspect - aspect ratio (w/h) the scene was calibrated for
 * @returns {number} vertical FOV in degrees
 */
export function computeFov(w, h, refFov, refAspect) {
  const aspect = w / h;
  const tanHalfHFov = Math.tan((refFov * Math.PI) / 360) * refAspect;
  return Math.atan(tanHalfHFov / aspect) * (360 / Math.PI);
}

/**
 * Applies a FOV value to both the Three.js camera and the framework component.
 * Always use this instead of setting .fov directly to avoid drift.
 *
 * @param {THREE.PerspectiveCamera} camera
 * @param {PerspectiveCamera}       cameraComponent - framework component
 * @param {number}                  fov
 */
export function applyFov(camera, cameraComponent, fov) {
  camera.fov = fov;
  cameraComponent.fov = fov;
  camera.updateProjectionMatrix();
}

// ─── Orthographic Frustum ─────────────────────────────────────────────────────

/**
 * Recomputes the frustum of an OrthographicCamera to correctly fill the
 * current viewport while preserving scene scale.
 *
 * @param {THREE.OrthographicCamera} cam
 * @param {number} w                 - viewport width  (matched to renderer)
 * @param {number} h                 - viewport height (matched to renderer)
 * @param {number} portraitViewSize  - world-unit half-width  in portrait  (default 14)
 * @param {number} landscapeViewSize - world-unit half-height in landscape (default 24)
 */
export function setOrthographicBounds(cam, w, h, portraitViewSize = 14, landscapeViewSize = 24) {
  const referenceRatio = 667 / 375;
  const isPortrait = h >= w * referenceRatio;

  let halfW, halfH;
  if (isPortrait) {
    halfW = portraitViewSize * 0.5;
    halfH = halfW * (h / w);
  } else {
    halfH = landscapeViewSize * 0.5;
    halfW = halfH * (w / h);
  }

  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.updateProjectionMatrix();
}

// ─── Camera Resolution ────────────────────────────────────────────────────────

/**
 * Decides which camera to use for rendering after the GLB has loaded and
 * initialises its projection for the current viewport.
 *
 * Priority:
 *   1. GLB camera (PerspectiveCamera or OrthographicCamera) when useGltfCamera is true
 *   2. Built-in PerspectiveCamera as fallback
 *
 * @param {() => {width:number, height:number}} getScreenSize - e.g. () => this.playable.helper.getScreenWidthHeight()
 * @param {GLTFLoaderComponent}     gltfLoader
 * @param {object}                  camCfg            - perspectiveCamera config block
 * @param {THREE.PerspectiveCamera} fallbackCamera     - built-in Three.js camera
 * @param {PerspectiveCamera}       fallbackComponent  - framework camera component
 * @returns {THREE.Camera}
 */
export function resolveActiveCamera(getScreenSize, gltfLoader, camCfg, fallbackCamera, fallbackComponent) {
  const { width: w, height: h } = getScreenSize();

  if (camCfg.useGltfCamera) {
    const gltfCam = gltfLoader.getGltfCamera();
    if (gltfCam) {
      if (gltfCam.isOrthographicCamera) {
        setOrthographicBounds(gltfCam, w, h, camCfg.orthoPortraitViewSize, camCfg.orthoLandscapeViewSize);
      } else {
        gltfCam.aspect = w / h;
        gltfCam.updateProjectionMatrix();
      }
      return gltfCam;
    }
    console.warn("[Camera] useGltfCamera is true but no camera found in GLB — falling back to perspective camera.");
  }

  // Default / fallback: built-in perspective camera.
  const fov = computeFov(w, h, camCfg.refFov ?? camCfg.fov, camCfg.refAspect ?? 9 / 16);
  applyFov(fallbackCamera, fallbackComponent, fov);
  fallbackComponent.setAspect(w / h);
  return fallbackCamera;
}

// ─── Resize ───────────────────────────────────────────────────────────────────

/**
 * Resizes the renderer to match the current screen size and updates the active
 * camera's projection accordingly.
 *
 * Returns true when an actual resize occurred so callers can react (e.g. re-layout UI).
 *
 * @param {THREE.WebGLRenderer}                 renderer
 * @param {() => {width:number, height:number}} getScreenSize - e.g. () => this.playable.helper.getScreenWidthHeight()
 * @param {THREE.Camera}                        activeCamera      - current rendering camera
 * @param {object}                              camCfg            - perspectiveCamera config block
 * @param {THREE.PerspectiveCamera}             fallbackCamera    - built-in Three.js camera
 * @param {PerspectiveCamera}                   fallbackComponent - framework camera component
 * @returns {boolean}
 */
export function resizeRendererToDisplaySize(
  renderer,
  getScreenSize,
  activeCamera,
  camCfg,
  fallbackCamera,
  fallbackComponent
) {
  const { width, height } = getScreenSize();
  renderer.getSize(_rendererSize);

  if (_rendererSize.x === width && _rendererSize.y === height) return false;

  renderer.setSize(width, height, false);

  if (activeCamera === fallbackCamera) {
    // Built-in (or fallback) perspective camera: recompute FOV and aspect.
    const newFov = computeFov(width, height, camCfg.refFov ?? camCfg.fov, camCfg.refAspect ?? 9 / 16);
    const aspect = width / height;
    // In landscape, only reduce FOV (prevents zoom-out artefact on orientation change).
    // In portrait, always apply the computed FOV.
    if (aspect <= 1 || fallbackCamera.fov >= newFov) {
      applyFov(fallbackCamera, fallbackComponent, newFov);
    }
    fallbackComponent.setAspect(width / height);
  } else if (activeCamera?.isOrthographicCamera) {
    // GLB OrthographicCamera: recompute frustum bounds.
    setOrthographicBounds(activeCamera, width, height, camCfg.orthoPortraitViewSize, camCfg.orthoLandscapeViewSize);
  } else {
    // GLB PerspectiveCamera: update aspect ratio only.
    activeCamera.aspect = width / height;
    activeCamera.updateProjectionMatrix();
  }

  return true;
}
