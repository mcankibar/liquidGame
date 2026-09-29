import _ from "lodash-es";
import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import * as THREE from "three";

export class PerspectiveCamera extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    let camera = this.gameObjectsMap.get("camera");
    
    if (_.isNil(camera)) {
      camera = new THREE.PerspectiveCamera();
      camera.aspect = 2; //default aspect ratio
      camera.near = this.near;
      camera.far = this.far;
      camera.position.set(this.position.x, this.position.y, this.position.z);
      this.scene.add(camera);
      this.camera = camera;

      this.setLookAtCoordinates(camera, this.lookAtCoordinates);
    }
    camera.fov = this.fov;

    camera.updateProjectionMatrix();
    this.gameObjectsMap.set("camera", camera);
  }

  setLookAtCoordinates(camera, lookAtCoordinates) {
    camera.lookAt(new THREE.Vector3(lookAtCoordinates.x, lookAtCoordinates.y, lookAtCoordinates.z));

    this.gameObjectsMap.set("camera", camera);
  }

  setAspect(aspect) {
    let camera = this.gameObjectsMap.get("camera");
    if (camera) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      this.aspect = aspect;
      this.gameObjectsMap.set("camera", camera);
    }
  }

  setPosition(position) {
    let camera = this.gameObjectsMap.get("camera");
    if (camera) {
      camera.position.set(position.x, position.y, position.z);

      this.position = position;
      this.gameObjectsMap.set("camera", camera);
    }
  }

  get() {
    return this.gameObjectsMap.get("camera");
  }
}
