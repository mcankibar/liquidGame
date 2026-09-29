import _ from "lodash-es";
/* 
   This component is used to load a single gltf file and add it to the scene,
   without ability to to load multiple gltf files. It is used to load a character model,
   with its animations, lights and camera.
*/
import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import { FIRST_LOAD_EVENT } from "../../modules/EventNames";
import { EventBus } from "../../modules/EventBus";

export class GLTFLoaderComponent extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);
    // cameras from GLB
    this.perspectiveCameras = [];
    this.perspectiveCamera = null;
    this.orthographicCameras = [];
    this.gltfOrthographicCamera = null;
    // directional lights
    this.directionalLights = [];
    this.directionalLight = null;
    // spotlights
    this.spotLights = [];
    this.spotLight = null;
    // pointlights
    this.pointLights = [];
    this.pointLight = null;
    // animations
    this.animations = [];

    this.eventBus = new EventBus();
    this.eventBus.on(
      FIRST_LOAD_EVENT,
      () => {
        this.firstRender();
      },
      0
    );
  }

  update(props) {
    super.update(props);
  }

  render() {}

  firstRender() {
    this.gltf = this.loadedGltfFilesInGameMap.get(_.get(this, "selectedGltfs.terrain[0].key"));
    if (!this.gltf) {
      console.error(`[${this.componentId}] terrain gltf is not loaded — skipping GLB scene setup`);
      return;
    }
    this.scene.add(this.gltf.scene);

    this.animations = this.gltf.animations;
    this.traverseGLTFScene();
    this.perspectiveCamera = this.setPerspectiveCamera();
    this.gltfOrthographicCamera = this.setOrthographicCamera();
    this.directionalLight = this.setDirectionalLight();
    this.spotLight = this.setSpotLight();
    this.pointLight = this.setPointLight();
  }

  /**
   * Traverses the loaded GLB scene (not the entire Three.js scene) and
   * collects cameras and lights by type.
   */
  traverseGLTFScene() {
    this.gltf.scene.traverse((child) => {
      if (child.isCamera) {
        if (child.isPerspectiveCamera) {
          this.perspectiveCameras.push(child);
        } else if (child.isOrthographicCamera) {
          this.orthographicCameras.push(child);
        }
      } else if (child.type === "DirectionalLight") {
        this.directionalLights.push(child);
      } else if (child.type === "SpotLight") {
        this.spotLights.push(child);
      } else if (child.type === "PointLight") {
        this.pointLights.push(child);
      }
    });
  }

  setPointLight() {
    if (this.pointLights.length !== 1) {
      if (this.pointLights.length === 0) {
        console.warn("POINT LIGHT DOES NOT EXIST");
        return null;
      } else {
        console.warn("THERE IS MORE THAN ONE POINT LIGHT. RETURNING FIRST");
        return this.pointLights[0];
      }
    } else {
      return this.pointLights[0];
    }
  }

  setSpotLight() {
    if (this.spotLights.length !== 1) {
      if (this.spotLights.length === 0) {
        console.warn("SPOT LIGHT DOES NOT EXIST");
        return null;
      } else {
        console.warn("THERE IS MORE THAN ONE SPOT LIGHT. RETURNING FIRST");
        return this.spotLights[0];
      }
    } else {
      return this.spotLights[0];
    }
  }

  setPerspectiveCamera() {
    if (this.perspectiveCameras.length !== 1) {
      if (this.perspectiveCameras.length === 0) {
        console.warn("PERSPECTIVE CAMERA DOES NOT EXIST");
        return null;
      } else {
        console.warn("THERE IS MORE THAN ONE PERSPECTIVE CAMERA. RETURNING FIRST");
        return this.perspectiveCameras[0];
      }
    } else {
      return this.perspectiveCameras[0];
    }
  }

  setDirectionalLight() {
    if (this.directionalLights.length !== 1) {
      if (this.directionalLights.length === 0) {
        console.warn("DIRECTIONAL LIGHT DOES NOT EXIST");
        return null;
      } else {
        console.warn("THERE IS MORE THAN ONE DIRECTIONAL LIGHT. RETURNING FIRST");
        return this.directionalLights[0];
      }
    } else {
      return this.directionalLights[0];
    }
  }

  setOrthographicCamera() {
    if (this.orthographicCameras.length === 0) return null;
    if (this.orthographicCameras.length > 1) {
      console.warn("[GLTFLoaderComponent] More than one OrthographicCamera found in GLB — returning first.");
    }
    return this.orthographicCameras[0];
  }

  /**
   * Returns the first GLB camera found, checking perspective first then orthographic.
   * Returns null if the GLB contains no camera.
   */
  getGltfCamera() {
    return this.perspectiveCamera ?? this.gltfOrthographicCamera ?? null;
  }

  getPerspectiveCamera() {
    return this.perspectiveCamera ?? null;
  }
}
