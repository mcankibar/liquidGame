import * as spine from "@esotericsoftware/spine-threejs";

/**
 * SpineAnimation
 *
 * Wraps spine-threejs to create a SkeletonMesh and AnimationState
 * from pre-loaded spine data (populated by BaseComponent.loadSpines).
 *
 * Usage:
 *   const anim = new SpineAnimation(this.getSpineData("redBird"), this.scene);
 *   anim.setAnimation("idle", true);
 *   // in update loop:
 *   anim.update(delta);
 */
export class SpineAnimation {
  /**
   * @param {Object} spineData - { skeletonData, atlas, texture } from loadedSpineDataMap
   * @param {THREE.Scene} scene
   * @param {Object} [options]
   * @param {number} [options.scale=1]
   * @param {number} [options.x=0]
   * @param {number} [options.y=0]
   * @param {number} [options.z=0]
   */
  constructor(spineData, scene, options = {}) {
    const { scale = 1, x = 0, y = 0, z = 0 } = options;

    const { skeletonData } = spineData;

    // SkeletonMesh is a THREE.Mesh subclass
    this.skeletonMesh = new spine.SkeletonMesh(skeletonData, (parameters) => {
      parameters.depthTest = false;
      parameters.alphaTest = 0.001;
      parameters.transparent = true;
    });

    this.skeletonMesh.scale.set(scale, scale, scale);
    this.skeletonMesh.position.set(x, y, z);

    const { skeleton, state } = this.skeletonMesh;
    this.skeleton = skeleton;
    this.state = state;

    scene.add(this.skeletonMesh);
  }

  /**
   * Play an animation by name.
   * @param {string} animationName
   * @param {boolean} [loop=true]
   * @param {number} [trackIndex=0]
   */
  setAnimation(animationName, loop = true, trackIndex = 0) {
    this.state.setAnimation(trackIndex, animationName, loop);
  }

  /**
   * Add an animation to the queue.
   * @param {string} animationName
   * @param {boolean} [loop=true]
   * @param {number} [delay=0]
   * @param {number} [trackIndex=0]
   */
  addAnimation(animationName, loop = true, delay = 0, trackIndex = 0) {
    this.state.addAnimation(trackIndex, animationName, loop, delay);
  }

  /**
   * Must be called every frame with the time delta in seconds.
   * @param {number} delta
   */
  update(delta) {
    this.skeletonMesh.update(delta);
  }

  /**
   * Set position.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    this.skeletonMesh.position.set(x, y, z);
  }

  /**
   * Set uniform scale.
   * @param {number} scale
   */
  setScale(scale) {
    this.skeletonMesh.scale.set(scale, scale, scale);
  }

  /**
   * Show or hide the spine mesh.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.skeletonMesh.visible = visible;
  }

  /**
   * Remove the mesh from the scene and dispose resources.
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    if (scene) {
      scene.remove(this.skeletonMesh);
    }
    if (this.skeletonMesh.geometry) {
      this.skeletonMesh.geometry.dispose();
    }
    if (Array.isArray(this.skeletonMesh.material)) {
      this.skeletonMesh.material.forEach((m) => m.dispose());
    } else if (this.skeletonMesh.material) {
      this.skeletonMesh.material.dispose();
    }
  }
}
