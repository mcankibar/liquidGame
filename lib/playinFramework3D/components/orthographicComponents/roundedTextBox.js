import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import SpriteText from "../../modules/ThreeSpriteText";
import * as THREE from "three";

export class RoundedTextBox extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
  }

  render() {
    if (_.has(this, "parent")) {
      this.isVisible = this.parent.isVisible;
    }

    let groupPosition;
    if (_.hasIn(this.parent, "getSpecificBounds")) {
      const specificBounds = this.parent.getSpecificBounds();
      this.shortEdge = Math.min(specificBounds.width, specificBounds.height);
      groupPosition = {
        x: specificBounds.leftX + specificBounds.width * this.RelativeX,
        y: specificBounds.topY - specificBounds.height * this.RelativeY
      };
    } else {
      this.shortEdge = Math.min(this.parent.AbsoluteWidth, this.parent.AbsoluteHeight);
      groupPosition = {
        x: this.CenterAbsoluteX,
        y: this.CenterAbsoluteY
      };
    }

    this.renderRoundedTextBoxGroup(groupPosition);
    this.updateRoundedBox();
    this.renderText();
  }

  renderRoundedTextBoxGroup(groupPosition) {
    let group = this.gameObjectsMap.get("roundedTextBoxGroup");

    if (_.isNil(group)) {
      group = new THREE.Group();
      this.gameObjectsMap.set("roundedTextBoxGroup", group);
      this.camera.add(group);

      let roundedBox = this.gameObjectsMap.get("roundedBox");
      if (_.isNil(roundedBox)) {
        roundedBox = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.loadedTexturesInGameMap.get(this.selectedImages.roundedBox[0].key),
            color: this.color
          })
        );

        this.roundedBoxMaterialWidth = roundedBox.material.map.image.width;
        this.roundedBoxMaterialHeight = roundedBox.material.map.image.height;

        roundedBox.center.set(0.5, 0.5);

        this.gameObjectsMap.set("roundedBox", roundedBox);
        group.add(roundedBox);
      }
    }

    const scaleRatio = this.shortEdge / this.roundedBoxMaterialWidth;

    const scaleX = this.roundedBoxMaterialWidth * scaleRatio * _.get(this, `size.${this.getOrientation()}.width`);
    const scaleY = this.roundedBoxMaterialHeight * scaleRatio * _.get(this, `size.${this.getOrientation()}.height`);

    if (group.scale.x !== scaleX || group.scale.y !== scaleY) {
      group.scale.set(scaleX, scaleY, 1);
    }

    if (
      group.position.x !== groupPosition.x ||
      group.position.y !== groupPosition.y ||
      group.position.z !== this.depth
    ) {
      group.position.set(groupPosition.x, groupPosition.y, this.depth);
    }
  }

  renderText() {
    const roundedTextBoxGroup = this.gameObjectsMap.get("roundedTextBoxGroup");

    const localization = this.localization[this.options.language];
    const textValue = this.formatText(localization.caption);

    let text = this.gameObjectsMap.get("text");
    if (_.isNil(text)) {
      text = new SpriteText(textValue);
      text.padding = 3;

      this.gameObjectsMap.set("text", text);
      roundedTextBoxGroup.add(text);
    } else {
      if (text.text !== textValue) {
        if (text.material.map) {
          text.material.map.dispose();
        }
        text.text = textValue;
      }
    }

    //text properties
    text.center.set(1 - localization.origin.x, localization.origin.y);

    const normalizedGroupScale = { x: 1, y: roundedTextBoxGroup.scale.y / roundedTextBoxGroup.scale.x };
    const textImage = text.material.map.image;

    const rawSize = {
      x: this.textSizeMultiplier.x,
      y: this.textSizeMultiplier.y * (textImage.height / textImage.width) * (1 / normalizedGroupScale.y)
    };

    const textScale = { x: rawSize.x * localization.fontSize, y: rawSize.y * localization.fontSize, z: 1 };
    setTimeout(() => {
      if (text.scale !== textScale) {
        text.scale.copy(textScale);
      }
    }, 0);

    if (text.fontFace !== localization.fontFamily) {
      text.fontFace = localization.fontFamily;
    }
    if (text.fontWeight !== localization.fontStyle) {
      text.fontWeight = localization.fontStyle;
    }
    if (text.color !== localization.fontColor) {
      text.color = localization.fontColor;
    }

    //visibility
    const visibility = this.isVisible && this.isTextEnabled;
    if (text.visible !== visibility) {
      text.visible = visibility;
    }
  }

  updateRoundedBox() {
    const roundedBox = this.gameObjectsMap.get("roundedBox");

    if (roundedBox.material.color !== this.color) {
      roundedBox.material.color.set(this.color);
    }

    // alpha
    if (roundedBox.material.opacity !== this.alpha) {
      roundedBox.material.opacity = this.alpha;
    }

    //visibility
    const visibility = this.isVisible && this.isBoxEnabled;
    if (roundedBox.visible !== visibility) {
      roundedBox.visible = visibility;
    }
  }

  get RoundedBox() {
    return this.gameObjectsMap.get("roundedBox");
  }

  get Text() {
    return this.gameObjectsMap.get("text");
  }

  formatText(text) {
    return text.replace(/\\n/g, "\n");
  }
}
