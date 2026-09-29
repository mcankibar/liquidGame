import _ from "lodash-es";
import * as THREE from "three";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import gsap from "gsap";
export class Background extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    this.isVisible = false;
    this.initialized = false;
    this.backgroundPlane = null;
    this.backgroundShown = false;
  }

  render() {
    super.render();
    if (!this.initialized) {
      this.init();
    }

    this.updateTexture();
    this.updatePosition();
    this.updateBackgroundSize();
    const visibility = this.backgroundShown && this.isEnabled;
    this.backgroundPlane.visible = visibility;
  }

  init() {
    if (this.initialized) {
      return;
    }

    const backgroundTexture = this.loadedTexturesInGameMap.get(this.selectedImages.background[0].key);
    const geometry = new THREE.PlaneGeometry(backgroundTexture.image.width, backgroundTexture.image.height);
    const material = new THREE.MeshBasicMaterial({
      map: backgroundTexture
    });

    this.backgroundMaterial = material;
    this.backgroundMaterial.transparent = true;

    this.backgroundPlane = new THREE.Mesh(geometry, material);
    this.camera.add(this.backgroundPlane);
    this.backgroundPlane.position.z = this.depth;

    this.backgroundPlane.visible = false;

    this.initialized = true;
  }

  updateBackgroundSize() {
    if (!this.backgroundPlane) {
      return;
    }

    setTimeout(() => {
      const planeWidth = this.backgroundPlane.geometry.parameters.width;
      const planeHeight = this.backgroundPlane.geometry.parameters.height;

      const scaleX = document.body.clientWidth / planeWidth;
      const scaleY = document.body.clientHeight / planeHeight;
      const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure full coverage

      const zoomAmount = _.get(this, `zoom.${this.getOrientation()}`);

      if (this.backgroundPlane.scale.x !== scale * zoomAmount || this.backgroundPlane.scale.y !== scale * zoomAmount) {
        this.backgroundPlane.scale.set(scale * zoomAmount, scale * zoomAmount, 1);
      }

      if(this.backgroundPlane.position.z !== this.depth) {
        this.backgroundPlane.position.z = this.depth;
      }
    }, 0);
  }

  updateTexture() {
    const texture = this.loadedTexturesInGameMap.get(this.selectedImages.background[0].key);
    if (this.backgroundPlane.material.map.uuid !== texture.uuid) {
      this.backgroundPlane.material.map = texture;

      this.backgroundPlane.geometry.dispose();
      const newGeometry = new THREE.PlaneGeometry(texture.image.width, texture.image.height);
      this.backgroundPlane.geometry = newGeometry;

      this.backgroundPlane.material.needsUpdate = true;
    }
  }

  fadeIn(duration = 0.5, onComplete) {
    if (this.backgroundShown) {
      return;
    }
    this.backgroundShown = true;
    if (!this.isEnabled) {
      return;
    }

    if (this.currentAnimation) {
      this.currentAnimation.kill();
    }

    this.backgroundPlane.visible = true;
    this.backgroundShown = true;
    this.backgroundMaterial.opacity = 0;

    this.currentAnimation = gsap.to(this.backgroundMaterial, {
      opacity: 1,
      duration: duration,
      onComplete: () => {
        this.currentAnimation = null;
        if (onComplete) onComplete();
      },
      onUpdate: () => {
        this.backgroundMaterial.opacity = this.currentAnimation.progress();
      }
    });
    this.backgroundShown = true;
  }

  updatePosition() {
    if (!this.backgroundPlane) {
      return;
    }

    const zoomStrength = 1000;

    const zoomPosition = _.get(this, `zoomPosition.${this.getOrientation()}`);
    const positionX = (zoomPosition.x - 0.5) * zoomStrength;
    const positionY = (0.5 - zoomPosition.y) * zoomStrength;

    if(this.backgroundPlane.position.x !== positionX || this.backgroundPlane.position.y !== positionY) {
      this.backgroundPlane.position.set(positionX, positionY, this.backgroundPlane.position.z);
    }
  }
}
