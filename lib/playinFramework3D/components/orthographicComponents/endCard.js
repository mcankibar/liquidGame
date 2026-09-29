import _ from "lodash-es";
import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import gsap from "gsap";
import * as THREE from "three";
import { RESTART_GAME } from "../../modules/EventNames";
import { EventBus } from "../../modules/EventBus";

export class EndCard extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    this.IsVisible = false;
    super.update(props);
    this.props = props;
    this.isEndCardRenderedWithFadeIn = false;
    this.endCardRendered = false;
    this.initialized = false;

    this.boundsLine = null;

    this.isScecificBoundsDrawn = false;

    this.eventBus = new EventBus();
    this.eventBus.on(RESTART_GAME, () => {
      this.onGameRestart();
    });
  }

  onGameRestart() {
    this.isEndCardRenderedWithFadeIn = false;
    this.endCardRendered = false;
    this.IsVisible = false;

    const dimmerComponent = this.getChildrenComponent(this.dimmer);
    const endCardBackgroundComponent = this.getChildrenComponent(this.background);
    const tutorialHandComponent = this.getChildrenComponent(this.hand);
    const roundedTextBox = this.getChildrenComponent(this.roundedTextBox);

    dimmerComponent.dimmer.visible = false;
    endCardBackgroundComponent.backgroundPlane.visible = false;
    tutorialHandComponent.isVisible = false;
    tutorialHandComponent.render();
    roundedTextBox.visible = false;
    roundedTextBox.render();

    this.getChildrenComponent(this.logo1).gameObjectsMap.get("logo").visible = false;
    this.getChildrenComponent(this.logo2).gameObjectsMap.get("logo").visible = false;

    this.render();
  }

  render() {
    if (this.isScecificBoundsDrawn) {
      this.drawSpecificBounds();
    }

    if (!_.has(this, "options.isEntireScreenCTAEnabled")) {
      throw "endCard does not have isEntireScreenCTAEnabled info";
    }

    if (!this.initialized) {
      this.initialized = true;
      if (this.options.isEntireScreenCTAEnabled) {
        document.addEventListener("pointerdown", () => {
          if (this.endCardRendered) {
            this.helper.openStore();
          }
        });
      }
    }

    if (this.isVisible) {
      this.onPlayableEnd();
    }

    if (this.endCardRendered) {
      const ctaButtonComponent = this.getChildrenComponent(this.button);
      const tutorialHandComponent = this.getChildrenComponent(this.hand);
      if (ctaButtonComponent) ctaButtonComponent.isVisible = true;
      if (tutorialHandComponent) tutorialHandComponent.isVisible = true;
    }
  }

  onPlayableEnd() {
    if (this.endCardRendered) {
      return;
    }

    const dimmerComponent = this.getChildrenComponent(this.dimmer);
    const endCardBackgroundComponent = this.getChildrenComponent(this.background);
    const ctaButtonComponent = this.getChildrenComponent(this.button);
    const tutorialHandComponent = this.getChildrenComponent(this.hand);
    const roundedTextBoxComponent = this.getChildrenComponent(this.roundedTextBox);
    const logoComponent = this.getChildrenComponent(this.logo1);
    const logo2Component = this.getChildrenComponent(this.logo2);

    ctaButtonComponent.InputStatus = !this.options.isEntireScreenCTAEnabled;

    //Tweens
    dimmerComponent.fadeIn(this.fadeInDurationInSeconds);
    endCardBackgroundComponent.fadeIn(this.fadeInDurationInSeconds);

    ctaButtonComponent.Group.children.forEach((child) => {
      child.material.opacity = 0;
    });

    logoComponent.startAnimation();
    if (logo2Component) {
      logo2Component.startAnimation();
    }

    gsap.to(roundedTextBoxComponent.RoundedBox.material, {
      duration: this.fadeInDurationInSeconds,
      opacity: roundedTextBoxComponent.alpha
    });

    const materialArray = [
      roundedTextBoxComponent.Text.material,
      ctaButtonComponent.Group.children[0].material,
      ctaButtonComponent.Group.children[1].material
    ];

    gsap.to(materialArray, {
      duration: this.fadeInDurationInSeconds,
      opacity: 1,
      onComplete: () => {
        this.endCardRendered = true;
        if (tutorialHandComponent) {
          tutorialHandComponent.isVisible = true;
          gsap.to(tutorialHandComponent.gameObjectsMap.get("hand").material, {
            duration: tutorialHandComponent.fadeInDurationInSeconds,
            opacity: 1
          });
        }
      }
    });
  }

  getChildrenComponent(componentId) {
    return this.helper.components.get(componentId);
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
