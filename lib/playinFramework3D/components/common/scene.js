import _ from "lodash-es";
import { BaseComponent } from "../baseComponent";
import * as THREE from "three";

export class Scene extends BaseComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }
  load() {
    super.load();
    if (_.hasIn(this, "onReady")) {
      this.onReady();
    }
  }
  render() {
    let scene = this.gameObjectsMap.get("scene");
    if (_.isNil(scene)) {
      scene = new THREE.Scene();
      this.scene = scene;
    }
    if (!_.isNil(this.background)) {
      this.setBackground();
    }
    this.gameObjectsMap.set("scene", scene);
  }

  get() {
    return this.gameObjectsMap.get("scene");
  }

  setBackground() {
    let scene = this.gameObjectsMap.get("scene");
    if(_.isNil(scene) || _.isNil(this.background))
    {
      return;
    }
    
    if(this.background.isTexture)
    {
      const texture = this.loadedTexturesInGameMap.get(this.selectedImages.background[0].key);
      scene.background = texture;
    }
    else
    {
      scene.background = new THREE.Color(this.background.color);
    }
  }

  add(object) {
    let scene = this.gameObjectsMap.get("scene");

    if (!_.isNil(scene)) {
      scene.add(object);
      this.gameObjectsMap.set("scene", scene);
    }
  }

  remove(object) {
    let scene = this.gameObjectsMap.get("scene");

    if (!_.isNil(scene)) {
      scene.remove(object);
      this.gameObjectsMap.set("scene", scene);
    }
  }
}
