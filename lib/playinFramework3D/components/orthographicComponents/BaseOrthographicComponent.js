import _ from "lodash-es";
import { BaseComponent } from "../baseComponent";
import * as THREE from "three";

export class BaseOrthographicComponent extends BaseComponent {
  constructor(props) {
    super(props);

    this.drawReferenceRectangle = false;
  }

  render() {
    if (this.drawReferenceRectangle) {
      this.renderReferenceRectangle(0x00ff00);
    }
  }

  renderReferenceRectangle(color) {
    if (_.isNil(this.referenceRectangle)) {
      this.referenceRectangle = new THREE.Mesh(
        new THREE.PlaneGeometry(this.AbsoluteWidth, this.AbsoluteHeight),
        new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, wireframe: true, wireframeLinewidth: 100 })
      );

      this.camera.add(this.referenceRectangle);
    } else {
      this.referenceRectangle.geometry = new THREE.PlaneGeometry(this.AbsoluteWidth, this.AbsoluteHeight);
    }

    // console.log("this.referenceRectangle", this.referenceRectangle);

    this.referenceRectangle.position.set(this.CenterAbsoluteX, this.CenterAbsoluteY, this.depth + 1);
  }

  get LeftAbsoluteX() {
    let value;
    if (_.isNil(this.parent)) {
      value = (this.RelativeX - 0.5) * document.body.clientWidth - 0.5 * this.AbsoluteWidth;
    } else {
      value = this.parent.LeftAbsoluteX + this.RelativeX * this.parent.AbsoluteWidth - 0.5 * this.AbsoluteWidth;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get TopAbsoluteY() {
    let value;
    if (_.isNil(this.parent)) {
      value = (0.5 - this.RelativeY) * document.body.clientHeight + 0.5 * this.AbsoluteHeight;
    } else {
      value = this.parent.TopAbsoluteY - (this.RelativeY * this.parent.AbsoluteHeight - 0.5 * this.AbsoluteHeight);
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get AbsoluteWidth() {
    let value;
    if (_.isNil(this.parent)) {
      value = this.RelativeWidth * document.body.clientWidth;
    } else {
      value = this.RelativeWidth * this.parent.AbsoluteWidth;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get AbsoluteHeight() {
    let value;
    if (_.isNil(this.parent)) {
      value = this.RelativeHeight * document.body.clientHeight;
    } else {
      value = this.RelativeHeight * this.parent.AbsoluteHeight;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get CenterAbsoluteX() {
    let value;
    if (_.isNil(this.parent)) {
      value = (this.RelativeX - 0.5) * document.body.clientWidth;
    } else {
      value = this.parent.LeftAbsoluteX + this.RelativeX * this.parent.AbsoluteWidth;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get CenterAbsoluteY() {
    let value;
    if (_.isNil(this.parent)) {
      value = (0.5 - this.RelativeY) * document.body.clientHeight;
    } else {
      value = this.parent.TopAbsoluteY - this.RelativeY * this.parent.AbsoluteHeight;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get RelativeX() {
    const value = _.get(this, `position.${this.getOrientation()}.x`);
    if (_.isNil(value)) {
      console.log("componentId", this.componentId);
      throw "could not get relative x";
    }
    return value;
  }

  get RelativeY() {
    const value = _.get(this, `position.${this.getOrientation()}.y`);
    if (_.isNil(value)) {
      throw "could not get relative y";
    }
    return value;
  }

  get RelativeWidth() {
    const value = _.get(this, `size.${this.getOrientation()}.width`);
    if (_.isNil(value)) {
      console.log("componentId", this.componentId);
      throw "could not get relative width";
    }
    return value;
  }

  get RelativeHeight() {
    const value = _.get(this, `size.${this.getOrientation()}.height`);
    if (_.isNil(value)) {
      throw "could not get relative height";
    }
    return value;
  }
}
