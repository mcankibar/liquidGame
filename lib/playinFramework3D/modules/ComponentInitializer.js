import _ from "lodash-es";

// Asset entries come from the playable runtime (playable/kit/runtime.js) and carry the type of the
// field they were declared with in src/params.js.
const SLOT_BY_TYPE = {
  image: "selectedImages",
  sound: "selectedSounds",
  model: "selectedGltfs"
};
// Multi-file assets declared with atlas() / spine() in src/params.js.
const SLOT_BY_LOADER = {
  atlas: "selectedAtlases",
  spine: "selectedSpines"
};

/**
 * Turns a component's `assets` map ({ slot: entry | entry[] }) into selectedImages / selectedSounds /
 * selectedGltfs / selectedAtlases / selectedSpines. Existing slots of those kinds are replaced, so
 * it is also used for live preview updates.
 */
export function assignAssets(component, assets, componentId = component.componentId) {
  const next = {};
  Object.entries(assets).forEach(([slot, value]) => {
    (Array.isArray(value) ? value : [value]).forEach(({ type, loader, ...entry }) => {
      const kind = loader ? SLOT_BY_LOADER[loader] : SLOT_BY_TYPE[type];
      if (!kind) throw new Error(`${componentId}.assets.${slot}: unsupported asset type "${type}"`);
      // The atlas loader reads parsed frame data from `JSON`.
      if (loader === "atlas" && entry.data && typeof entry.data === "object") entry.JSON = entry.data;
      next[kind] = next[kind] || {};
      (next[kind][slot] = next[kind][slot] || []).push(entry);
    });
  });
  Object.assign(component, next);
}

export class ComponentInitializer {
  /**
   * @param componentsMap - map
   * @param componentsReadyStatusMap - map
   * @param onComponentsReady - function
   * @param eventBus - object
   */
  constructor(componentsMap, componentsReadyStatusMap, onComponentsReady, eventBus) {
    this.componentsMap = componentsMap;
    this.componentsReadyStatusMap = componentsReadyStatusMap;
    this.onComponentsReady = onComponentsReady;
    this.eventBus = eventBus;
  }

  /**
   * @param props.componentId - string
   * @param props.componentClass - class
   * @param props.componentConfig - object; its `assets` map ({ slot: entry | entry[] }) becomes
   *        selectedImages / selectedSounds / selectedGltfs / selectedAtlases / selectedSpines.
   */
  initializeComponent(props) {
    const requiredProps = ["componentId", "componentConfig", "componentClass"];
    for (const prop of requiredProps) {
      if (!_.has(props, prop)) {
        throw new Error(`${prop} is missing for initializeComponent`);
      }
    }

    const { componentId, componentConfig, componentClass } = props;
    const { assets, ...config } = componentConfig;

    const component = new componentClass(config);
    this.componentsMap.set(componentId, component);

    if (assets) assignAssets(component, assets, componentId);

    component.eventBus = this.eventBus;
    component.componentId = componentId;
    this.componentsReadyStatusMap.set(componentId, false);
    component.onReady = () => {
      this.componentsReadyStatusMap.set(componentId, true);
      if ([...this.componentsReadyStatusMap.values()].every((value) => value)) {
        this.onComponentsReady();
      }
    };
    return component;
  }
}
