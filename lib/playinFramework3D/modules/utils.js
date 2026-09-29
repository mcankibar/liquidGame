import _ from "lodash-es";
import * as THREE from "three";
/**
 *
 * @param object Three object. It will be manipulated by config.
 * @param config Component configurations from currentGameConfig
 * @param parent provide store parent object on recursion, initial value must be null
 */
export function checkDifferencesOnAllAttributes(object, config, parent) {
  Object.keys(config)
    .filter((key) => !_.isNil(object[key]))
    .forEach((key) => {
      if (typeof config[key] === "object" && !_.isNil(config[key])) {
        parent = key;
        if (key === "geometry") {
          object[key].dispose();
          let type = Object.getPrototypeOf(object[key]).constructor.name;
          if (type === "PlaneGeometry") {
            object[key] = new THREE.PlaneGeometry(
              config.geometry.width,
              config.geometry.height,
              config.geometry.widthSegment,
              config.geometry.heightSegment
            );
          } else if (type === "BoxGeometry") {
            object[key] = new THREE.BoxGeometry(
              config.geometry.width,
              config.geometry.height,
              config.geometry.depth,
              config.geometry.widthSegment,
              config.geometry.heightSegment,
              config.geometry.depthSegment
            );
          }
        }
        checkDifferencesOnAllAttributes(object[key], config[key], parent);
      } else {
        if (parent !== "geometry") {
          if (key === "color") {
            object[key].set(config[key]);
          } else {
            if (config[key] !== object[key]) {
              object[key] = config[key];
            }
          }
        }
      }
    });
}

/**
 *
 * @param value
 * @param min
 * @param max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function map(value, min, max, minOut, maxOut) {
  return (value - min) * (maxOut - minOut) / (max - min) + minOut;
}

export function createDebugSphere(scene, position, radius, color = 0xff0000, removeAfter = 1000) {
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity : 0.5 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  scene.add(sphere);
  console.log("Debug Sphere: ", sphere);

  setTimeout(() => {
    scene.remove(sphere);
  }, removeAfter);  
}

export function getWorldToScreen(renderer, perspectiveCamera, worldPosition)
{
  const pos = worldPosition.clone();
  perspectiveCamera.updateMatrixWorld();
  pos.project(perspectiveCamera);

  const screenX = (pos.x + 1) / 2 * renderer.domElement.clientWidth;
  const screenY = (-pos.y + 1) / 2 * renderer.domElement.clientHeight;
  
  const orthoX = screenX - renderer.domElement.clientWidth / 2;
  const orthoY = -screenY + renderer.domElement.clientHeight / 2;
  
  return { x: orthoX, y: orthoY };
}
