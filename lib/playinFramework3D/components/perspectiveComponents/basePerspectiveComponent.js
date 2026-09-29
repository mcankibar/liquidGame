import { BaseComponent } from "../baseComponent";
import * as perspectiveUtils from "../../modules/componentUtils/perspectiveUtils";

export class BasePerspectiveComponent extends BaseComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  getPerspectiveCameraVector(vector) {
    return perspectiveUtils.getPerspectiveCameraVector(this.camera, this.WEBGLRenderer, vector);
  }
}
