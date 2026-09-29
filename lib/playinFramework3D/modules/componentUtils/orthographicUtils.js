import _ from "lodash-es";
import * as THREE from "three";

export function renderGroup(component) {
  let group = component.gameObjectsMap.get("group");

  if (_.isNil(group)) {
    group = new THREE.Group();
    component.gameObjectsMap.set("group", group);
    component.scene.add(group);
  }

  let groupPosition;
  if (_.hasIn(component.parent, "getSpecificBounds")) {
    const specificBounds = component.parent.getSpecificBounds();

    component.shortEdge = Math.min(specificBounds.width, specificBounds.height);
    groupPosition = {
      x: specificBounds.leftX + specificBounds.width * component.RelativeX,
      y: specificBounds.topY - specificBounds.height * component.RelativeY
    };
  } else {
    component.shortEdge = Math.min(component.parent.AbsoluteWidth, component.parent.AbsoluteHeight);
    groupPosition = {
      x: component.CenterAbsoluteX,
      y: component.CenterAbsoluteY
    };
  }

  if (
    group.position.x !== groupPosition.x ||
    group.position.y !== groupPosition.y ||
    group.position.z !== component.depth
  ) {
    group.position.set(groupPosition.x, groupPosition.y, component.depth);
  }

  component.group = group;
}
