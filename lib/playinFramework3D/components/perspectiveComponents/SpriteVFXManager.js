import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import * as THREE from "three";
import gsap from "gsap";
import * as gameObjectUtils from "../../modules/componentUtils/gameObjectUtils";

export class SpriteVFXManager extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
  }

  render() {
    super.render();
    this.init();
    this.checkAtlasUpdate();
  }

  checkAtlasUpdate() {
    if (!this.vfxMesh) return;

    const atlasKey = this.getActiveAtlasKey();
    if (!atlasKey) return;

    const currentFrames = this.loadedAtlasTexturesMap.get(atlasKey);
    if (!currentFrames) return;
    if (currentFrames === this.activeFramesRef) return;

    this.activeFramesRef = currentFrames;
    this.activeAtlasKey = atlasKey;

    const firstFrame = currentFrames.values().next().value;
    this.vfxMesh.material.map = firstFrame;
    this.vfxMesh.material.needsUpdate = true;
    gameObjectUtils.setGameObjectScale(this.vfxMesh, this.vfxScale, this.vfxScale, this.vfxScale);
  }

  init() {
    if (this.initialized) return;

    const atlasKey = this.getActiveAtlasKey();
    if (!atlasKey) {
      this.initialized = true;
      return;
    }

    const frames = this.loadedAtlasTexturesMap.get(atlasKey);
    if (!frames || frames.size === 0) return;

    this.initialized = true;
    this.initVFX(atlasKey, frames);

    if (this.isAnimationPlayOnClick) {
      this._clickHandler = () => this.playAnimation({ x: 0, y: 0, z: 0 });
      window.addEventListener("pointerdown", this._clickHandler);
    }
  }

  initVFX(atlasKey, frames) {
    const initialTexture = frames.values().next().value;

    const geometry = new THREE.PlaneGeometry(initialTexture.image.width, initialTexture.image.height);
    const material = new THREE.MeshBasicMaterial({
      map: initialTexture,
      transparent: true,
      depthWrite: false
    });

    this.vfxMesh = new THREE.Mesh(geometry, material);
    this.vfxMesh.scale.set(this.vfxScale, this.vfxScale, this.vfxScale);
    this.vfxMesh.visible = false;
    this.vfxMesh.name = "spriteVFX";
    this.vfxMesh.renderOrder = 1000;
    this.scene.add(this.vfxMesh);

    this.activeAtlasKey = atlasKey;
    this.activeFramesRef = frames;
  }

  playAnimation(position) {
    if (!this.vfxMesh) return;

    const frames = this.loadedAtlasTexturesMap.get(this.activeAtlasKey);
    if (!frames) return;

    const frameTextures = [...frames.values()];
    const frameCount = frameTextures.length;
    const progress = { t: 0 };

    this.vfxMesh.position.set(position.x, position.y, position.z);

    gsap.to(progress, {
      t: 1,
      duration: this.vfxDuration,
      onStart: () => {
        this.vfxMesh.visible = true;
      },
      onUpdate: () => {
        const frameIndex = Math.min(frameCount - 1, Math.floor(progress.t * frameCount));
        this.vfxMesh.material.map = frameTextures[frameIndex];
        this.vfxMesh.material.needsUpdate = true;
      },
      onComplete: () => {
        this.vfxMesh.visible = false;
      }
    });
  }

  getActiveAtlasKey() {
    if (!this.selectedAtlases) return null;

    const firstAtlasGroup = Object.values(this.selectedAtlases)[0];
    if (!firstAtlasGroup || firstAtlasGroup.length === 0) return null;

    return firstAtlasGroup[0].key;
  }
}
