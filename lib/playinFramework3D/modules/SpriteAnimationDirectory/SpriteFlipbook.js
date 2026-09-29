import * as THREE from "three";

/**
 * This class provides to functionality to animate sprite sheets.
 */
export class SpriteFlipbook {
  /**
   *
   * @param tilesHoriz Horizontal number of tiles
   * @param tilesVert Vertical number of tiles
   * @param scene Three.js scene which will contain the sprite
   */
  constructor(tilesHoriz, tilesVert, scene, map) {
    this.tilesHoriz = tilesHoriz;
    this.tilesVert = tilesVert;
    this.currentTile = 0;
    this.maxDisplayTime = 0;
    this.elapsedTime = 0;
    this.runningTileArrayIndex = 0;

    this.map = map.clone();
    this.map.magFilter = THREE.NearestFilter; // sharp pixel sprite
    this.map.repeat.set(1 / tilesHoriz, 1 / tilesVert);

    this.update(0);

    const material = new THREE.SpriteMaterial({ map: this.map });

    this.sprite = new THREE.Sprite(material);
    this.visible = false;

    scene.add(this.sprite);
  }

  loop(playSpriteIndices, totalDuration) {
    this.playSpriteIndices = playSpriteIndices;
    this.runningTileArrayIndex = 0;
    this.currentTile = playSpriteIndices[this.runningTileArrayIndex];
    this.maxDisplayTime = totalDuration / this.playSpriteIndices.length;
    this.elapsedTime = this.maxDisplayTime; // force to play new animation
    this.isEnded = false;
  }

  setVisible(value) {
    this.sprite.visible = value;
    this.visible = value;
  }

  setPosition(x, y, z) {
    this.sprite.position.x = x;
    this.sprite.position.y = y;
    this.sprite.position.z = z;
  }

  addPosition(x, y, z) {
    this.sprite.position.x += x;
    this.sprite.position.y += y;
    this.sprite.position.z += z;
  }

  setScale(scale) {
    this.sprite.scale.set(scale.x, scale.y, scale.z);
  }

  getPosition() {
    return this.sprite.position;
  }

  update(delta) {
    if (!this.visible) return;
    this.elapsedTime += delta;

    if (this.maxDisplayTime > 0 && this.elapsedTime >= this.maxDisplayTime) {
      this.elapsedTime = 0;
      if (this.runningTileArrayIndex === this.playSpriteIndices.length - 1) {
        this.isEnded = true;
        return;
      }
      this.runningTileArrayIndex++;
      this.currentTile = this.playSpriteIndices[this.runningTileArrayIndex];

      const offsetX = (this.currentTile % this.tilesVert) / this.tilesVert;
      const offsetY = 1 - (Math.floor(this.currentTile / this.tilesVert) + 1) / this.tilesHoriz;

      this.map.offset.x = offsetX;
      this.map.offset.y = offsetY;
    }
  }
}
