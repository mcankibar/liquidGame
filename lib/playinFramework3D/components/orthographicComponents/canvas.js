import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import * as THREE from "three";

export class Canvas extends BaseOrthographicComponent {
  constructor(props) {
    super(props);

    this.isScecificBoundsDrawn = false;
  }

  render() {
    if (this.isScecificBoundsDrawn) {
      this.drawSpecificBounds();
    }
  }

  get AbsoluteWidth() {
    if (this.canvasSize === "fill") {
      return document.body.clientWidth;
    }
  }

  get AbsoluteHeight() {
    let height = document.body.clientHeight;
    if (this.options.isBannerEnabled) {
      const bannerComponent = this.helper.components.get(this.banner);
      const bannerComponentHeight = height * _.get(bannerComponent, `size.${this.getOrientation()}.height`);
      return (height -= bannerComponentHeight);
    }
    if (this.canvasSize === "fill") {
      return height;
    }
  }

  get LeftAbsoluteX() {
    return -0.5 * this.AbsoluteWidth;
  }

  get TopAbsoluteY() {
    if (this.options.isBannerEnabled) {
      const bannerComponent = this.helper.components.get(this.banner);
      let height = document.body.clientHeight;
      const bannerComponentHeight = height * _.get(bannerComponent, `size.${this.getOrientation()}.height`);
      if (bannerComponent.dock === "top") {
        return document.body.clientHeight * 0.5 - bannerComponentHeight;
      } else if (bannerComponent.dock === "bottom") {
        return 0;
      }
    } else {
      return 0.5 * this.AbsoluteHeight;
    }
  }

  drawSpecificBounds() {
    const bounds = this.getSpecificBounds();

    const bottomY = bounds.topY - bounds.height;

    const topLeft = new THREE.Vector3(bounds.leftX, bounds.topY, 0);
    const topRight = new THREE.Vector3(bounds.leftX + bounds.width, bounds.topY, 0);
    const bottomRight = new THREE.Vector3(bounds.leftX + bounds.width, bottomY, 0);
    const bottomLeft = new THREE.Vector3(bounds.leftX, bottomY, 0);

    const points = [topLeft, topRight, bottomRight, bottomLeft, topLeft];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const line = new THREE.LineLoop(geometry, material);

    if (this.boundsLine) {
      this.scene.remove(this.boundsLine);
      this.boundsLine.geometry.dispose();
      this.boundsLine.material.dispose();
      this.boundsLine = null;
    }

    this.scene.add(line);
    this.boundsLine = line;
  }

  getSpecificBounds() {
    let baseWidth, baseHeight;

    if (document.body.clientHeight > document.body.clientWidth) {
      baseWidth = 375;
      baseHeight = 667;
    } else {
      baseWidth = 667;
      baseHeight = 375;
    }

    const widthRatio = document.body.clientWidth / baseWidth;
    const heightRatio = document.body.clientHeight / baseHeight;

    let boundWidth, boundHeight;

    if (widthRatio > heightRatio) {
      boundWidth = heightRatio * baseWidth;
      boundHeight = heightRatio * baseHeight;
    } else {
      boundWidth = widthRatio * baseWidth;
      boundHeight = widthRatio * baseHeight;
    }

    const boundLeftX = (document.body.clientWidth - boundWidth) * 0.5;
    const boundTopY = (document.body.clientHeight - boundHeight) * 0.5;

    const toNDC = (x, y) => ({
      x: (x / window.innerWidth) * 2 - 1,
      y: -((y / window.innerHeight) * 2 - 1)
    });

    const ndcToWorld = (ndc) => {
      const vec = new THREE.Vector3(ndc.x, ndc.y, 0);
      vec.unproject(this.camera);
      return vec;
    };

    const topLeft = ndcToWorld(toNDC(boundLeftX, boundTopY));
    const bottomRight = ndcToWorld(toNDC(boundLeftX + boundWidth, boundTopY + boundHeight));

    return {
      leftX: topLeft.x,
      topY: topLeft.y,
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y)
    };
  }
}
