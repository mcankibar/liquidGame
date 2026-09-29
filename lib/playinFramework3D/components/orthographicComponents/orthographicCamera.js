import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import * as THREE from "three";

export class OrthographicCamera extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    let camera = this.gameObjectsMap.get("camera");

    let screenSize = { width: 0, height: 0 };

    // Since orhographic camera is being rendered before playable is initialized, we cannot get screen size from playable.js at the first time.
    // This can be improved by improving this function, or reordering render queue.
    if (this.helper) {
      screenSize = this.helper.getScreenWidthHeight();
      screenSize.width = screenSize.width / window.devicePixelRatio;
      screenSize.height = screenSize.height / window.devicePixelRatio;
    }

    if (_.isNil(camera)) {
      camera = new THREE.OrthographicCamera(
        -screenSize.width / 2,
        screenSize.width / 2,
        screenSize.height / 2,
        -screenSize.height / 2,
        1,
        this.position.z
      );
      this.scene.add(camera);
    } else {
      this.set(-screenSize.width / 2, screenSize.width / 2, screenSize.height / 2, -screenSize.height / 2);
    }
    camera.position.z = this.position.z;
    this.gameObjectsMap.set("camera", camera);
  }

  get() {
    return this.gameObjectsMap.get("camera");
  }

  set(left, right, top, bottom) {
    let camera = this.gameObjectsMap.get("camera");

    if (!_.isNil(camera)) {
      camera.left = left;
      camera.right = right;
      camera.top = top;
      camera.bottom = bottom;
      camera.updateProjectionMatrix();
      this.gameObjectsMap.set("camera", camera);
    }
  }
}
