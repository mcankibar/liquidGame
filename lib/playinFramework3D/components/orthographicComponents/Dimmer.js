import { BaseOrthographicComponent } from "./BaseOrthographicComponent";
import * as THREE from "three";
import gsap from "gsap";

export class Dimmer extends BaseOrthographicComponent {
  constructor(props) {
    super(props);
    this.props = props;
    this.initialized = false;

    this.dimmerMaterial = null;
    this.dimmerShape = null;
    this.currentAnimation = null;
    this.dimmerShown = false;
  }

  render() {
    super.render();
    if (!this.initialized) {
      this.init();
    }

    this.updateDimmer();
  }

  init() {
    this.dimmerShape = new THREE.Shape();
    this.dimmerShape.moveTo(-document.body.clientWidth * 0.5, -document.body.clientHeight * 0.5);
    this.dimmerShape.lineTo(-document.body.clientWidth * 0.5, document.body.clientHeight * 0.5);
    this.dimmerShape.lineTo(document.body.clientWidth * 0.5, document.body.clientHeight * 0.5);
    this.dimmerShape.lineTo(document.body.clientWidth * 0.5, -document.body.clientHeight * 0.5);
    const geometry = new THREE.ShapeGeometry(this.dimmerShape);
    this.dimmerMaterial = new THREE.MeshBasicMaterial({ color: this.color });
    this.dimmerMaterial.transparent = true;
    this.dimmer = new THREE.Mesh(geometry, this.dimmerMaterial);
    this.camera.add(this.dimmer);
    this.dimmer.position.z = this.depth;

    this.dimmer.visible = this.parent.isVisible;

    this.initialized = true;
  }

  fadeIn(duration = 0.5, opacityIn = this.alpha, onComplete) {
    if(this.dimmerShown)
    {
      return;
    }
    
    if (this.currentAnimation) {
      this.currentAnimation.kill();
    }

    this.dimmerMaterial.opacity = 0;
    
    this.currentAnimation = gsap.to(this.dimmerMaterial, {
      opacity: opacityIn,
      duration: duration,
      onStart: () => {
        this.dimmer.visible = true;
      },
      onComplete: () => {
        this.currentAnimation = null;
        this.dimmerShown = true;
        if (onComplete) onComplete();
      },
      onUpdate: () => {
        this.dimmerMaterial.opacity = this.currentAnimation.progress() * opacityIn;
      }
    });

  }

  fadeOut(duration = 0.5, onComplete) {
    if (this.currentAnimation) {
      this.currentAnimation.kill();
    }
    
    this.currentAnimation = gsap.to(this.dimmerMaterial, {
      opacity: 0,
      duration: duration,
      onComplete: () => {
        this.currentAnimation = null;
        if (onComplete) onComplete();
      }
    });
  }

  updateDimmer() {
    if(this.dimmer.position.z !== this.depth) {
      this.dimmer.position.z = this.depth;
    }

    if(this.dimmer.scale.x !== document.body.clientWidth || this.dimmer.scale.y !== document.body.clientHeight) {
      this.dimmer.scale.set(document.body.clientWidth, document.body.clientHeight);
    }
    
    if (!this.dimmerMaterial.color.equals(new THREE.Color(this.color))) {
      this.dimmerMaterial.color.set(this.color);
    }

    if (this.dimmerMaterial.opacity !== this.alpha) {
      this.dimmerMaterial.opacity = this.alpha;
    }
  }
}