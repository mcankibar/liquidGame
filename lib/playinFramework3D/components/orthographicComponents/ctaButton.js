import _ from "lodash-es";
import * as THREE from "three";
import SpriteText from "../../modules/ThreeSpriteText";
import gsap from "gsap";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";

export class CtaButton extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
    this.movements = this.animationType
      ? [{ action: this.animationType, duration: this.scaleAnimationDurationInSeconds }]
      : [];
    this.tweens = [];
    this.isDelayedOnce = false;
    this.InputStatus = true;
    this.handObject = null;
  }

  set InputStatus(value) {
    this.inputStatus = value;
  }

  get InputStatus() {
    return this.inputStatus;
  }

  killTweens() {
    this.tweens.forEach((value, index, array) => {
      const tweenToKill = array.pop();
      tweenToKill.restart();
      tweenToKill.kill();
    });
  }

  get Group() {
    const group = this.gameObjectsMap.get("ctaButtonGroup");
    if (!_.isNil(group)) {
      return group;
    } else {
      console.warn("group does not exist", group);
      return null;
    }
  }

  render() {
    this.killTweens();

    if (!_.has(this, "options.link")) {
      throw "ctaButton does not have store links";
    }
    if (!_.has(this, "options.language")) {
      throw "ctaButton does not have language info";
    }
    if (_.has(this, "isInGameComponent") && this.isInGameComponent) {
      if (!_.has(this, "options.isInGameCTAEnabled")) {
        throw "ctaButton does not have isInGameCTAEnabled info";
      }
    }
    super.render();

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

    const localization = this.localization[this.options.language];
    let ctaButtonGroup = this.gameObjectsMap.get("ctaButtonGroup");
    let ctaButton = this.gameObjectsMap.get("ctaButton");
    let ctaButtonText = this.gameObjectsMap.get("ctaButtonText");

    if (_.isNil(ctaButtonGroup)) {
      //ctaButtonGroup
      ctaButtonGroup = new THREE.Group();
      this.gameObjectsMap.set("ctaButtonGroup", ctaButtonGroup);

      //ctaButton
      if (_.isNil(ctaButton)) {
        this.ctaButtonMaterial = new THREE.SpriteMaterial({
          map: this.loadedTexturesInGameMap.get(this.selectedImages.ctaButton[0].key)
        });

        this.ctaButtonMaterialWidth = this.ctaButtonMaterial.map.image.width;
        this.ctaButtonMaterialHeight = this.ctaButtonMaterial.map.image.height;

        ctaButton = new THREE.Sprite(this.ctaButtonMaterial);
        ctaButton.name = this.componentId;
        ctaButtonGroup.add(ctaButton);
        this.gameObjectsMap.set("ctaButton", ctaButton);

        document.addEventListener("pointerdown", (event) => {
          if (!this.isVisible) {
            return;
          }
          if (!this.inputStatus) {
            return;
          }
          if (_.has(this, "isInGameComponent") && this.isInGameComponent && !this.options.isInGameCTAEnabled) {
            return;
          }

          let mouse = new THREE.Vector2();
          mouse.x = (event.clientX / document.body.clientWidth) * 2 - 1;
          mouse.y = -(event.clientY / document.body.clientHeight) * 2 + 1;

          this.raycaster.setFromCamera(mouse, this.camera);

          let intersects = this.raycaster.intersectObjects(this.scene.children, true);
          let isCtaButtonVisible = false;
          if (intersects.length > 0) {
            for (let i = 0; i < intersects.length; i++) {
              if (intersects[i].object.name === this.componentId && ctaButtonGroup.visible) {
                isCtaButtonVisible = true;
              }
            }
            if (isCtaButtonVisible) {
              this.onButtonClicked();
            }
          }
        });
        ctaButton.center.set(0.5, 0.5);

        ctaButtonGroup.add(ctaButton);
      }

      //ctaButtonText
      if (_.isNil(ctaButtonText)) {
        ctaButtonText = new SpriteText(localization.caption);
        ctaButtonText.padding = 3;
        ctaButtonGroup.add(ctaButtonText);
        ctaButtonText.visible = false;
        this.gameObjectsMap.set("ctaButtonText", ctaButtonText);
      }

      this.camera.add(ctaButtonGroup);
    } else {
      //cta button
      const texture = this.loadedTexturesInGameMap.get(this.selectedImages.ctaButton[0].key);
      if (texture.uuid !== ctaButton.material.map.uuid) {
        this.ctaButtonMaterial.map = texture;
        this.ctaButtonMaterialWidth = this.ctaButtonMaterial.map.image.width;
        this.ctaButtonMaterialHeight = this.ctaButtonMaterial.map.image.height;
        ctaButton.material = this.ctaButtonMaterial;
      }

      //cta button text
      if (ctaButtonText.text !== localization.caption) {
        if (ctaButtonText.material.map) {
          ctaButtonText.material.map.dispose();
        }
        ctaButtonText.visible = false;
        ctaButtonText.text = localization.caption;
      }
    }

    // group scale
    const scaleRatio = this.shortEdge / this.ctaButtonMaterialWidth;

    const scaleX = this.ctaButtonMaterialWidth * scaleRatio * _.get(this, `scale.${this.getOrientation()}`);
    const scaleY = this.ctaButtonMaterialHeight * scaleRatio * _.get(this, `scale.${this.getOrientation()}`);

    if (ctaButtonGroup.scale.x !== scaleX || ctaButtonGroup.scale.y !== scaleY) {
      ctaButtonGroup.scale.set(scaleX, scaleY, 1);
    }

    //group position
    if (
      ctaButtonGroup.position.x !== groupPosition.x ||
      ctaButtonGroup.position.y !== groupPosition.y ||
      ctaButtonGroup.position.z !== this.depth
    ) {
      ctaButtonGroup.position.set(groupPosition.x, groupPosition.y, this.depth);
    }

    //cta button text
    ctaButtonText.center.set(1 - localization.origin.x, localization.origin.y);

    const image = ctaButtonText.material.map.image;

    const normalizedGroupScale = { x: 1, y: ctaButtonGroup.scale.y / ctaButtonGroup.scale.x };

    const rawSize = {
      x: this.textSizeMultiplier.x,
      y: this.textSizeMultiplier.y * (image.height / image.width) * (1 / normalizedGroupScale.y)
    };
    const textScale = { x: rawSize.x * localization.fontSize, y: rawSize.y * localization.fontSize, z: 1 };

    setTimeout(() => {
      ctaButtonText.scale.copy(textScale);
      ctaButtonText.visible = true;
    }, 0);

    if (ctaButtonText.fontFace !== localization.fontFamily) {
      ctaButtonText.fontFace = localization.fontFamily;
    }
    if (ctaButtonText.fontWeight !== localization.fontStyle) {
      ctaButtonText.fontWeight = localization.fontStyle;
    }
    if (ctaButtonText.color !== localization.fontColor) {
      ctaButtonText.color = localization.fontColor;
    }

    //visibility
    if (_.has(this, "isInGameComponent") && this.isInGameComponent) {
      if (this.options.isInGameCTAEnabled && !this.helper.getIsEndCardShown()) {
        ctaButtonGroup.visible = this.isVisible;
      } else {
        ctaButtonGroup.visible = false;
      }
    } else {
      ctaButtonGroup.visible = this.isVisible;
    }

    this.timeline = gsap.timeline({ repeat: -1 });
    this.defaultScale = ctaButtonGroup.scale;
    this.movements.forEach((movement) => {
      switch (movement.action) {
        case "scaleAnimation":
          const scaleAnimation = this.timeline.add(
            gsap.to(ctaButtonGroup.scale, {
              duration: this.scaleAnimationDurationInSeconds,
              repeat: 1,
              yoyo: true,
              x: this.defaultScale.x * 1.1,
              y: this.defaultScale.y * 1.1,
              z: this.defaultScale.z * 1.1
            })
          );
          this.tweens.push(scaleAnimation);
          break;
        case "idle":
          const idleTween = this.timeline.add(
            gsap.to(ctaButtonGroup.scale, {
              duration: movement.duration
            })
          );
          this.tweens.push(idleTween);
          break;
        case "click":
          const clickTween = this.timeline.add(
            gsap.to(ctaButtonGroup.scale, {
              duration: 0.01,
              x: this.defaultScale.x * 0.9,
              y: this.defaultScale.y * 0.9,
              z: this.defaultScale.z * 0.9,
              onStart: () => {
                if (!_.isNil(this.handObject)) {
                  this.handObject.switchTexture();
                }
              }
            })
          );
          this.tweens.push(clickTween);
          break;
        case "unclick":
          const unclickTween = this.timeline.add(
            gsap.to(ctaButtonGroup.scale, {
              duration: 0.01,
              x: this.defaultScale.x,
              y: this.defaultScale.y,
              z: this.defaultScale.z,
              onStart: () => {
                if (!_.isNil(this.handObject)) {
                  this.handObject.switchTexture();
                }
              }
            })
          );
          this.tweens.push(unclickTween);
          break;
        default:
          break;
      }
    });
    this.timeline.pause();
    if (this.isVisible && this.isAnimationEnabled) {
      if (!this.isDelayedOnce) {
        this.isDelayedOnce = true;
        setTimeout(() => {
          this.timeline.play();
        }, this.delayInMilliseconds);
      } else {
        this.timeline.play();
      }
    }
  }

  getPositionAndSize() {
    const ctaButtonGroup = this.gameObjectsMap.get("ctaButtonGroup");
    return {
      x: ctaButtonGroup.position.x,
      y: ctaButtonGroup.position.y,
      width: ctaButtonGroup.scale.x,
      height: ctaButtonGroup.scale.y
    };
  }

  // This function is called when the button is clicked.
  // It can be overriden externally.
  onButtonClicked() {
    console.debug("opening store");
    this.helper.openStore();
  }
}
