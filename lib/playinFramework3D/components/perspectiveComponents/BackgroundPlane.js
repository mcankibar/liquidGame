import * as THREE from "three";
import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import { getVisibleSizeAtDistance } from "../../modules/componentUtils/perspectiveUtils";

export class BackgroundPlane extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);

    this.perspectiveCamera = null;
    this.initialized = false;
    if (this.isEnabled == null) this.isEnabled = true;
  }

  render() {
    this.perspectiveCamera = this.perspectiveCamera || this.camera;

    if (this.isEnabled === false) {
      if (this.backgroundPlane) this.backgroundPlane.visible = false;
      return;
    }

    if (!this.initialized) {
      this.init();
    }

    if (this.backgroundPlane) this.backgroundPlane.visible = true;
    this.updateTexture();
    this.updatePosition();
    this.updateBackgroundSize();
  }

  setCamera(camera) {
    if (!camera) return;
    this.perspectiveCamera = camera;
    this.camera = camera;

    if (!this.backgroundPlane) return;

    if (this.backgroundPlane.parent) {
      this.backgroundPlane.parent.remove(this.backgroundPlane);
    }
    camera.add(this.backgroundPlane);
    this.updatePosition();
    this.updateBackgroundSize();
  }

  init() {
    if (this.initialized) {
      return;
    }

    this.perspectiveCamera = this.perspectiveCamera || this.camera;
    if (!this.perspectiveCamera) {
      console.warn("[BackgroundPlane] No camera available — skip init.");
      return;
    }

    const backgroundTexture = this.loadedTexturesInGameMap.get(this.selectedImages.background[0].key);
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;
    backgroundTexture.minFilter = THREE.LinearFilter;
    backgroundTexture.magFilter = THREE.LinearFilter;

    const distance = this.backgroundDistance;

    const geometry = new THREE.PlaneGeometry(backgroundTexture.image.width, backgroundTexture.image.height);
    const material = new THREE.MeshBasicMaterial({
      map: backgroundTexture,
      depthTest: false
    });

    this.backgroundPlane = new THREE.Mesh(geometry, material);
    this.backgroundPlane.position.set(0, 0, -distance); // Place it at a fixed distance
    this.backgroundPlane.renderOrder = -10;

    // Attach to the camera so it moves with it
    if (this.perspectiveCamera) {
      this.perspectiveCamera.add(this.backgroundPlane);
    } else {
      console.warn("perspectiveCamera is not initialized");
    }

    this.updateBackgroundSize();

    // Ensure updates on resize
    window.addEventListener("resize", () => {
      this.updateBackgroundSize();
    });

    this.initialized = true;
  }

  updatePosition() {
    if (!this.backgroundPlane || !this.perspectiveCamera) {
      return;
    }

    if (
      this.backgroundPlane.position.x !== this.xPositionOffset ||
      this.backgroundPlane.position.y !== -this.yPositionOffset
    ) {
      this.backgroundPlane.position.set(this.xPositionOffset, -this.yPositionOffset, -this.backgroundDistance);
    }
  }

  updateBackgroundSize() {
    if (!this.backgroundPlane || !this.perspectiveCamera) {
      return;
    }

    const distance = this.backgroundDistance;

    const { visibleHeight, visibleWidth } = getVisibleSizeAtDistance(this.perspectiveCamera, distance);

    const planeWidth = this.backgroundPlane.geometry.parameters.width;
    const planeHeight = this.backgroundPlane.geometry.parameters.width;

    let scale;
    if (window.innerWidth < window.innerHeight) {
      scale = visibleHeight / planeHeight;
    } else {
      scale = visibleWidth / planeWidth;
    }

    if (this.backgroundPlane.scale.x !== scale * this.scale || this.backgroundPlane.scale.y !== scale * this.scale) {
      this.backgroundPlane.scale.set(scale * this.scale, scale * this.scale, 1);
    }
  }

  updateTexture() {
    if (!this.initialized) {
      return;
    }

    const texture = this.loadedTexturesInGameMap.get(this.selectedImages.background[0].key);
    if (this.backgroundPlane.material.map.uuid !== texture.uuid) {
      this.backgroundPlane.material.map.dispose();
      this.backgroundPlane.material.map = texture;
    }
  }
}
