export function setGameObjectScale(gameObject, scaleX = 1, scaleY = 1, scaleZ = 1) {
  if (gameObject.scale.x !== scaleX || gameObject.scale.y !== scaleY || gameObject.scale.z !== scaleZ) {
    gameObject.scale.set(scaleX, scaleY, scaleZ);
  }
}

export function setGameObjectPosition(gameObject, positionX = 0, positionY = 0, positionZ = 0) {
  if (
    gameObject.position.x !== positionX ||
    gameObject.position.y !== positionY ||
    gameObject.position.z !== positionZ
  ) {
    gameObject.position.set(positionX, positionY, positionZ);
  }
}

export function setGameObjectRotation(gameObject, rotationX = 0, rotationY = 0, rotationZ = 0) {
  if (
    gameObject.rotation.x !== rotationX ||
    gameObject.rotation.y !== rotationY ||
    gameObject.rotation.z !== rotationZ
  ) {
    gameObject.rotation.set(rotationX, rotationY, rotationZ);
  }
}

export function setGameObjectMaterialMap(gameObject, map) {
  if (gameObject.material.map.uuid !== map.uuid) {
    gameObject.material.map = map;
  }
}

export function setGameObjectColor(gameObject, color) {
  if (!gameObject.material || !gameObject.material.color) return;

  const currentHex = gameObject.material.color.getHex();
  const nextColor = new gameObject.material.color.constructor(color);
  if (currentHex !== nextColor.getHex()) {
    gameObject.material.color.set(color);
  }
}

export function setGameObjectVisible(gameObject, isVisible) {
  if (gameObject.visible !== isVisible) {
    gameObject.visible = isVisible;
  }
}

export function setGameObjectOpacity(gameObject, opacity) {
  if (gameObject.material.opacity !== opacity) {
    gameObject.material.opacity = opacity;
    gameObject.material.transparent = opacity < 1;
  }
}

export function setTextCaption(textObject, caption) {
  if (textObject.text !== caption) {
    if (textObject.material.map) {
      textObject.material.map.dispose();
    }

    textObject.text = caption;
  }
}
