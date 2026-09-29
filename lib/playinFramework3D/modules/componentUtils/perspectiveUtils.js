import * as THREE from "three";

export function getPerspectiveCameraVector(camera, renderer, vector) {
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;

  const widthHalf = width / 2;
  const heightHalf = height / 2;
  vector.project(camera);
  vector.x = vector.x * widthHalf;
  vector.y = vector.y * heightHalf;
  return vector;
}

export function getVisibleSizeAtDistance(camera, distance) {
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFOV / 2) * distance;
  const visibleWidth = visibleHeight * camera.aspect;

  return { visibleWidth, visibleHeight };
}
