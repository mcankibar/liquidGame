import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import * as THREE from "three";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.registerPlugin(MotionPathPlugin);

export class TutorialHand extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
    this.handStartPosition = { x: 0, y: 0 };
    this.movements = [];
    this.tweens = [];
    this.isDelayedOnce = false;
  }

  addHandActions() {
    if (this.animationOption === "custom") {
      return;
    }
    let movements = [];
    if (this.animationOption === "sliding") {
      //going left to right and vice versa
      const orientation = this.getOrientation();
      let slideRange;
      if (orientation === "portrait") {
        slideRange = document.body.clientWidth * 0.25;
      } else {
        slideRange = document.body.clientWidth * 0.1;
      }

      movements.push({ action: "unclick" });
      movements.push({ action: "idle", duration: 0.5 });
      movements.push({ action: "click" });
      movements.push({
        action: "moveTo",
        duration: this.moveToDurationInSeconds,
        position: {
          x: this.HandCenterAbsoluteX - slideRange,
          y: this.HandCenterAbsoluteY
        }
      });
      movements.push({
        action: "moveTo",
        duration: this.moveToDurationInSeconds * 2,
        position: {
          x: this.HandCenterAbsoluteX + slideRange,
          y: this.HandCenterAbsoluteY
        }
      });
      movements.push({
        action: "moveTo",
        duration: this.moveToDurationInSeconds,
        position: {
          x: this.HandCenterAbsoluteX,
          y: this.HandCenterAbsoluteY
        }
      });
      movements.push({ action: "unclick" });
      movements.push({ action: "idle", duration: 0.5 });
    } else if (this.animationOption === "circle") {
      //circle move
      movements.push({
        action: "circleMove"
      });
    } else if (this.animationOption === "infinitySign") {
      //going in 8 path forever
      movements.push({
        action: "infinitySignMove"
      });
    } else if (this.animationOption === "scaleAnimation") {
      //going in 8 path forever
      movements.push({
        action: "scaleAnimation"
      });
    } else {
      throw { message: "please provide a animationOption", animationOption: this.animationOption };
    }
    this.movements = movements;
  }

  get HandRelativeX() {
    const value = _.get(this, `handPosition.${this.getOrientation()}.x`);
    if (_.isNil(value)) {
      throw "could not get relative x";
    }
    return value;
  }

  get HandRelativeY() {
    const value = _.get(this, `handPosition.${this.getOrientation()}.y`);
    if (_.isNil(value)) {
      throw "could not get relative y";
    }
    return value;
  }

  get HandCenterAbsoluteX() {
    let value;
    if (_.isNil(this.parent)) {
      value = (this.HandRelativeX - 0.5) * document.body.clientWidth;
    } else {
      value = this.parent.LeftAbsoluteX + this.HandRelativeX * this.parent.AbsoluteWidth;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  get HandCenterAbsoluteY() {
    let value;
    if (_.isNil(this.parent)) {
      value = (0.5 - this.HandRelativeY) * document.body.clientHeight;
    } else {
      value = this.parent.TopAbsoluteY - this.HandRelativeY * this.parent.AbsoluteHeight;
    }
    if (Number.isNaN(value)) {
      throw "value is NaN";
    }
    return value;
  }

  killTweens() {
    this.tweens.forEach((value, index, array) => {
      const tweenToKill = array.pop();
      tweenToKill.kill();
    });
    if (!_.isNil(this.timeline)) {
      this.timeline.kill();
    }
  }

  pointerDownListener() {
    if (_.has(this, "isInGameComponent") && this.isInGameComponent && this.isVisible) {
      this.IsVisible = false;
      let hand = this.gameObjectsMap.get("hand");
      if (!_.isNil(hand) && hand.visible === true) {
        hand.visible = false;
      }
    }
  }

  render() {
    if (_.has(this, "isInGameComponent") && this.isInGameComponent) {
      if (!_.has(this, "options.isTutorialEnabled")) {
        throw "tutorialHand in gameScene does not have isTutorialEnabled info";
      }
    }
    if (_.isNil(this.movements)) {
      return;
    }
    super.render();
    this.addHandActions();
    const normalTextureKey = _.find(this.selectedImages.default, (image) => {
      return image.variant === "normal";
    }).key;
    const glowTextureKey = _.find(this.selectedImages.default, (image) => {
      return image.variant === "glow";
    }).key;

    const shortEdge = Math.min(document.body.clientWidth, document.body.clientHeight);
    let hand = this.gameObjectsMap.get("hand");
    if (!_.isNil(hand)) {
      hand.visible = this.isVisible;
    }
    if (this.isVisible === false) {
      this.killTweens();
      return;
    }
    //hand initialization
    if (_.isNil(hand)) {
      this.handMaterial = new THREE.SpriteMaterial({
        map: this.loadedTexturesInGameMap.get(normalTextureKey)
      });
      this.handMaterialWidth = this.handMaterial.map.image.width;
      this.handMaterialHeight = this.handMaterial.map.image.height;
      hand = new THREE.Sprite(this.handMaterial);
      hand.material.opacity = this.initialOpacity;
      if (this.isInGameComponent) {
        document.addEventListener("pointerdown", this.pointerDownListener.bind(this));
      }
      this.camera.add(hand);
      this.gameObjectsMap.set("hand", hand);
    } else {
      const normalTexture = this.loadedTexturesInGameMap.get(normalTextureKey);
      if (this.handMaterial.map.uuid !== normalTexture.uuid) {
        this.handMaterial.map = normalTexture;
        this.handMaterialWidth = this.handMaterial.map.image.width;
        this.handMaterialHeight = this.handMaterial.map.image.height;
        hand.material = this.handMaterial;
      }
      hand.material.opacity = this.initialOpacity;
      if (_.isFunction(this.onResize)) {
        this.onResize();
        hand.position.set(this.handStartPosition.x, this.handStartPosition.y, this.depth);
      }
    }

    //hand
    hand.center.set(this.origin.x, this.origin.y);
    const scaleRatio = shortEdge / this.handMaterialWidth;
    hand.scale.set(
      this.handMaterialWidth * scaleRatio * _.get(this, `scale.${this.getOrientation()}`),
      this.handMaterialHeight * scaleRatio * _.get(this, `scale.${this.getOrientation()}`),
      1
    );

    if (this.isInGameComponent) {
      if (this.options.isTutorialEnabled) {
        this.IsVisible = this.isEnabled;
        hand.visible = this.isEnabled;
      } else {
        this.IsVisible = false;
        hand.visible = false;
      }
      hand.position.set(this.handStartPosition.x, this.handStartPosition.y, this.depth);
    } else {
      hand.visible = this.isVisible && this.isEnabled;
      const positionOffset = _.get(this, `positionOffset.${this.getOrientation()}`);
      const parentPositionAndSize = this.parent.getPositionAndSize();
      this.handStartPosition = {
        x: parentPositionAndSize.x + parentPositionAndSize.width * (positionOffset.x - 0.5),
        y: parentPositionAndSize.y + parentPositionAndSize.height * (0.5 - positionOffset.y)
      };
      //for hand in endcard, this is called.
      hand.position.set(this.handStartPosition.x, this.handStartPosition.y, this.depth);
    }
    this.killTweens();
    this.timeline = gsap.timeline({ repeat: -1 });
    if (this.movements.length === 0) return;
    hand.material.opacity = 1;
    this.movements.forEach((movement, index, array) => {
      switch (movement.action) {
        case "unclick":
          const unclickTween = this.timeline.add(
            gsap.to(hand.material, {
              duration: 0,
              onComplete: () => {
                hand.material.map = this.loadedTexturesInGameMap.get(normalTextureKey);
              }
            })
          );
          this.tweens.push(unclickTween);
          break;
        case "click":
          const clickTween = this.timeline.add(
            gsap.to(hand.material, {
              duration: 0,
              onComplete: () => {
                hand.material.map = this.loadedTexturesInGameMap.get(glowTextureKey);
              }
            })
          );
          this.tweens.push(clickTween);
          break;
        case "idle":
          const idleTween = this.timeline.add(
            gsap.to(hand.userData, {
              duration: movement.duration
            })
          );
          this.tweens.push(idleTween);
          break;
        case "fadeIn":
          const fadeInTween = this.timeline.add(
            gsap.to(hand.material, {
              duration: this.fadeInDurationInSeconds,
              opacity: 1
            })
          );
          this.tweens.push(fadeInTween);
          break;
        case "fadeOut":
          const fadeOutTween = this.timeline.add(
            gsap.to(hand.material, {
              duration: this.fadeOutDurationInSeconds,
              opacity: 0
            })
          );
          this.tweens.push(fadeOutTween);
          break;
        case "moveTo":
          const moveToTween = this.timeline.add(
            gsap.to(hand.position, {
              duration: movement.duration,
              x: movement.position.x,
              y: movement.position.y,
              ease: "none"
            })
          );
          this.tweens.push(moveToTween);
          break;
        case "circleMove":
          const circleTween = this.timeline.add(
            gsap.to(hand.position, {
              duration: this.circleMoveDurationInSeconds,
              motionPath: [
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY
                },
                {
                  x: this.HandCenterAbsoluteX + shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY + shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY + shortEdge * this.radiusPercentage * 2
                },
                {
                  x: this.HandCenterAbsoluteX - shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY + shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY
                }
              ],
              ease: "none"
            })
          );
          this.tweens.push(circleTween);
          break;
        case "infinitySignMove":
          const infinitySignMove = this.timeline.add(
            gsap.to(hand.position, {
              duration: this.infinitySignMoveDurationInSeconds,
              motionPath: [
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY
                },
                {
                  x: this.HandCenterAbsoluteX + shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY + shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX + shortEdge * this.radiusPercentage * 2,
                  y: this.HandCenterAbsoluteY
                },
                {
                  x: this.HandCenterAbsoluteX + shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY - shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY
                },
                {
                  x: this.HandCenterAbsoluteX - shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY + shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX - shortEdge * this.radiusPercentage * 2,
                  y: this.HandCenterAbsoluteY
                },
                {
                  x: this.HandCenterAbsoluteX - shortEdge * this.radiusPercentage,
                  y: this.HandCenterAbsoluteY - shortEdge * this.radiusPercentage
                },
                {
                  x: this.HandCenterAbsoluteX,
                  y: this.HandCenterAbsoluteY
                }
              ],
              ease: "none"
            })
          );
          this.tweens.push(infinitySignMove);
          break;
        case "scaleAnimation": {
          const scaleTween = this.timeline.add(
            gsap.to(hand.scale, {
              duration: this.scaleAnimationDurationInSeconds,
              x: hand.scale.x * 0.9,
              y: hand.scale.y * 0.9,
              ease: "linear",
              yoyo: true,
              repeat: -1
            })
          );
          this.tweens.push(scaleTween);
          break;
        }
        default:
          break;
      }
    });
    this.timeline.pause();
    if (this.isVisible) {
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
}
