import { BasePerspectiveComponent } from "./basePerspectiveComponent";
import * as THREE from "three";
export class AmbientLight extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    if(!this.initialized) {
      this.init();
      return;
    }

    this.updateLight();
  }

  init()
  {
    const ambientLight = new THREE.AmbientLight(this.color, this.intensity);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;
    this.initialized = true;
  }

  updateLight()
  {
    if(!this.initialized) {
      return;
    }

    if
    (
      this.ambientLight.color.r !== this.color.r ||
      this.ambientLight.color.g !== this.color.g ||
      this.ambientLight.color.b !== this.color.b
    ) 
    {
      this.ambientLight.color.set(this.color);
    }

    if(this.ambientLight.intensity !== this.intensity) {
      this.ambientLight.intensity = this.intensity;
    }
  }
}
