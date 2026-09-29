import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import * as THREE from "three";
import SpriteText from "../../modules/ThreeSpriteText";

export class Banner extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    if (!_.has(this, "options.isBannerEnabled")) {
      throw "banner does not have isBannerEnabled info";
    }
    if (!_.has(this, "options.language")) {
      throw "banner does not have language info";
    }
    super.render();
    let x, y, textX, textY, bannerHeight;
    if (this.dock === "top") {
      x = -0.5 * document.body.clientWidth;
      y = document.body.clientHeight * 0.5;
      textX = 0;
      textY = (1 - _.get(this, `size.${this.getOrientation()}.height`)) * document.body.clientHeight * 0.5;
      bannerHeight = _.get(this, `size.${this.getOrientation()}.height`) * document.body.clientHeight;
    } else if (this.dock === "bottom") {
      //TODO: not stable right now
      x = 0;
      y = this.scene.game.canvas.height * (1 - _.get(this, `size.${this.scene.getOrientation()}.height`));
      textX = _.get(this, `size.${this.scene.getOrientation()}.width`) * this.scene.game.canvas.width * 0.5;
      textY = this.scene.game.canvas.height * (1 - _.get(this, `size.${this.scene.getOrientation()}.height`) * 0.5);
    } else {
      throw { message: "this banner component does not have dock property", component: this };
    }
    const localization = this.localization[this.options.language];
    let banner = this.gameObjectsMap.get("banner");
    let bannerText = this.gameObjectsMap.get("bannerText");
    if (this.options.isBannerEnabled) {
      if (_.isNil(banner)) {
        const rectangleShape = new THREE.Shape();
        rectangleShape.moveTo(-document.body.clientWidth * 0.5, bannerHeight * 0.5);
        rectangleShape.lineTo(document.body.clientWidth * 0.5, bannerHeight * 0.5);
        rectangleShape.lineTo(document.body.clientWidth * 0.5, -bannerHeight * 0.5);
        rectangleShape.lineTo(-document.body.clientWidth * 0.5, -bannerHeight * 0.5);
        const geometry = new THREE.ShapeGeometry(rectangleShape);
        this.bannerMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.bannerMaterial.transparent = true;
        banner = new THREE.Mesh(geometry, this.bannerMaterial);
        this.camera.add(banner);
        banner.position.z = this.depth;
        this.defaultScaleWidth = document.body.clientWidth;
        this.defaultScaleHeight = bannerHeight;
        this.gameObjectsMap.set("banner", banner);
      } else {
        banner.scale.set(
          (1 * document.body.clientWidth) / this.defaultScaleWidth,
          (1 * bannerHeight) / this.defaultScaleHeight
        );
      }
      banner.position.set(textX, textY, this.depth);
      if (banner.visible === false) {
        banner.visible = true;
      }
      //bannerText
      if (_.isNil(bannerText)) {
        bannerText = new SpriteText(localization.caption);
        bannerText.padding = 3;
        this.camera.add(bannerText);
        this.gameObjectsMap.set("bannerText", bannerText);
      } else {
        if (bannerText.text !== localization.caption) {
          if (bannerText.material.map) {
            bannerText.material.map.dispose();
          }
          bannerText.text = localization.caption;
        }
      }
      bannerText.center.set(1 - localization.origin.x, localization.origin.y);
      bannerText.position.set(textX, textY, this.depth + 2);
      if (bannerText.textHeight !== bannerHeight * localization.fontSize) {
        bannerText.textHeight = bannerHeight * localization.fontSize;
      }
      if (bannerText.fontFace !== localization.fontFamily) {
        bannerText.fontFace = localization.fontFamily;
      }
      if (bannerText.fontWeight !== localization.fontStyle) {
        bannerText.fontWeight = localization.fontStyle;
      }
      if (bannerText.color !== localization.fontColor) {
        bannerText.color = localization.fontColor;
      }
      if (bannerText.visible === false) {
        bannerText.visible = true;
      }
      //color
      if (this.bannerMaterial.color !== this.color) {
        this.bannerMaterial.color = new THREE.Color(this.color);
      }
      //alpha
      if (this.bannerMaterial.opacity !== this.alpha) {
        this.bannerMaterial.opacity = this.alpha;
      }
    } else {
      if (!_.isNil(banner)) {
        banner.visible = false;
      }
      if (!_.isNil(bannerText)) {
        bannerText.visible = false;
      }
    }
  }
}
