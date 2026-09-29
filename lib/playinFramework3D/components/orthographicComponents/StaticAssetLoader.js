import { BaseOrthographicComponent } from "./BaseOrthographicComponent";

// Aim of this class is seperating static assets from components to adapt components to dashboard restrictions.
export class StaticAssetLoader extends BaseOrthographicComponent {
  constructor(gameConfig) {
    super(gameConfig);
  }
  render() {}

  getOpitonFrameImageKey() {
    return this.selectedImages.optionFrame[0].key;
  }
}
