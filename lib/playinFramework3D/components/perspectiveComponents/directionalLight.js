import _ from "lodash-es";
import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import * as THREE from "three";
import { checkDifferencesOnAllAttributes } from "../../modules/utils";

export class DirectionalLight extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    let directionalLight = this.gameObjectsMap.get("directionalLight");

    if (_.isNil(directionalLight)) {
      directionalLight = new THREE.DirectionalLight();
      this.scene.add(directionalLight);

      this.setLookAtCoordinates(directionalLight, this.lookAtCoordinates);
    }
    checkDifferencesOnAllAttributes(directionalLight, this);
    // const helper = new THREE.DirectionalLightHelper(directionalLight, 5);
    // this.scene.add(helper);

    // this.scene.add(new THREE.CameraHelper(directionalLight.shadow.camera));
    this.gameObjectsMap.set("directionalLight", directionalLight);
  }

  get() {
    return this.gameObjectsMap.get("directionalLight");
  }

  setLookAtCoordinates(light, lookAtCoordinates) {
    light.lookAt(new THREE.Vector3(lookAtCoordinates.x, lookAtCoordinates.y, lookAtCoordinates.z));
  }

  updatePosition(position) {
    let directionalLight = this.gameObjectsMap.get("directionalLight");
    if (directionalLight) {
      directionalLight.position.set(position.x, position.y, position.z);
      this.position = position;
      this.gameObjectsMap.set("directionalLight", directionalLight);
    }
  }

  updateTarget(target) {
    let directionalLight = this.gameObjectsMap.get("directionalLight");
    if (directionalLight) {
      directionalLight.target = target;
    }
    this.gameObjectsMap.set("directionalLight", directionalLight);
  }
}
