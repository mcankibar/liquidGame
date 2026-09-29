import _ from "lodash-es";
/**
 *
 * @param map
 * @param key
 * @returns {undefined|*}
 */
export function tryGetValueFromMap(map, key) {
  if (_.isNil(map)) {
    // console.debug("map is nil");
    return undefined;
  }
  if (map.has(key)) {
    return map.get(key);
  } else {
    console.trace("key is not exist in map", key);
  }
}
