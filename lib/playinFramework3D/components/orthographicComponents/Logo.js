import _ from "lodash-es";
import * as THREE from "three";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import gsap from "gsap";

export class Logo extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    super.update(props);
    this.IsVisible = false;
    this.props = props;
  }

  render() {
    super.render();
    if (_.has(this, "parent")) {
      this.isVisible = this.parent.isVisible;
    }

    let logoPosition;
    if (_.hasIn(this.parent, "getSpecificBounds")) {
      const specificBounds = this.parent.getSpecificBounds();
      this.shortEdge = Math.min(specificBounds.width, specificBounds.height);
      logoPosition = {
        x: specificBounds.leftX + specificBounds.width * this.RelativeX,
        y: specificBounds.topY - specificBounds.height * this.RelativeY
      };
    } else {
      this.shortEdge = Math.min(this.parent.AbsoluteWidth, this.parent.AbsoluteHeight);
      logoPosition = {
        x: this.CenterAbsoluteX,
        y: this.CenterAbsoluteY
      };
    }

    let logo = this.gameObjectsMap.get("logo");

    if (_.isNil(logo)) {
      if (!this.loadedTexturesInGameMap.has(this.selectedImages.logo[0].key)) {
        throw {
          message: "texture key does not exist in game",
          textureKey: this.selectedImages.logo[0].key
        };
      }

      this.logoMaterial = new THREE.SpriteMaterial({
        map: this.loadedTexturesInGameMap.get(this.selectedImages.logo[0].key)
      });

      this.logoMaterialWidth = this.logoMaterial.map.image.width;
      this.logoMaterialHeight = this.logoMaterial.map.image.height;

      logo = new THREE.Sprite(this.logoMaterial);
      logo.name = this.componentId;
      this.logo = logo;

      if (this.parent.type === "endCard" || this.isEnabled === false) {
        logo.visible = false;
      }

      document.addEventListener("pointerdown", (event) => {
        if (!this.isVisible) return;

        let mouse = new THREE.Vector2();
        mouse.x = (event.clientX / document.body.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / document.body.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(mouse, this.camera);

        let intersects = this.raycaster.intersectObjects(this.scene.children, true);
        let isLogoVisible = false;
        if (intersects.length > 0) {
          for (let i = 0; i < intersects.length; i++) {
            if (intersects[i].object.name === this.componentId && logo.visible) {
              isLogoVisible = true;
            }
          }
          if (isLogoVisible) {
            if (this.isOpenStoreEnabled) {
              this.helper.openStore();
            }
          }
        }
      });

      logo.center.set(0.5, 0.5);

      this.gameObjectsMap.set("logo", logo);
      this.camera.add(logo);
    } else {
      if (this.logoMaterial.map.uuid !== this.loadedTexturesInGameMap.get(this.selectedImages.logo[0].key).uuid) {
        if (!this.loadedTexturesInGameMap.has(this.selectedImages.logo[0].key)) {
          throw {
            message: "texture key does not exist in game",
            textureKey: this.selectedImages.logo[0].key
          };
        }
        this.logoMaterial.map = this.loadedTexturesInGameMap.get(this.selectedImages.logo[0].key);
        this.logoMaterialWidth = this.logoMaterial.map.image.width;
        this.logoMaterialHeight = this.logoMaterial.map.image.height;
        logo.material = this.logoMaterial;
      }

      if (this.parent.type === "endCard") {
        logo.visible = this.parent.endCardRendered && this.isEnabled;
      } else {
        logo.visible = this.isEnabled;
      }
    }

    const scaleRatio = this.shortEdge / this.logoMaterialWidth;
    const scaleX = this.logoMaterialWidth * scaleRatio * _.get(this, `scale.${this.getOrientation()}`);
    const scaleY = this.logoMaterialHeight * scaleRatio * _.get(this, `scale.${this.getOrientation()}`);

    if (logo.scale.x !== scaleX || logo.scale.y !== scaleY) {
      logo.scale.set(scaleX, scaleY, 1);
    }

    if (logo.position.x !== logoPosition.x || logo.position.y !== logoPosition.y || logo.position.z !== this.depth) {
      logo.position.set(logoPosition.x, logoPosition.y, this.depth);
    }
  }

  startAnimation() {
    if (!this.isVisible || this.isEnabled === false) {
      return;
    }

    if (this.currentAnimation) {
      this.currentAnimation.kill();
    }

    this.logo.visible = true;

    if (this.animationType === "fadeIn") {
      this.logo.material.opacity = 0;
      this.currentAnimation = gsap.to(this.logo.material, {
        opacity: 1,
        duration: this.fadeInDurationInSeconds
      });
    } else if (this.animationType === "scaleUp") {
      const targetScale = this.logo.scale.clone();
      this.logo.scale.set(0, 0, 1);
      this.currentAnimation = gsap.to(this.logo.scale, {
        x: targetScale.x,
        y: targetScale.y,
        duration: this.scaleUpDurationInSeconds
      });
    }
  }
}
