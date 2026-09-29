import { Pane } from "tweakpane";
import _ from "lodash-es";

const sampleLanguages = {
  "en": "English - En",
  "af": "Afrikaans - Af",
  "sq": "Albanian - Sq",
  "ar": "Arabic - Ar",
  "hy": "Armenian - Hy",
  "az": "Azerbaijani - Az",
  "be": "Belarusian - Be",
  "bg": "Bulgarian - Bg",
  "ca": "Catalan - Ca",
  "zh": "Chinese - Zh"
};

const ignoredComponentIds = ["canvas1"];
const ignoredKeys = [
  "atlas",
  "background",
  "boxWithText",
  "button",
  "condition",
  "dock",
  "depth",
  "dimmer",
  "hand",
  "isGameSceneComponent",
  "isInGameComponent",
  "isVisible",
  "logo1",
  "logo2",
  "name",
  "parentId",
  "type"
  // "size"
];
const sliderKeys = ["alpha", "fontSize", "height", "width", "portrait", "landscape", "origin", "volume", "x", "y"];

export function addTweakPane(defaultGameConfig) {
  let tweakPaneGameConfig = { components: {}, options: {} };
  const pane = new Pane({
    // container: document.body,
    title: "Game Config",
    expanded: false
  });
  pane.element.parentElement.style.zIndex = "1500";
  pane.element.parentElement.style.overflowY = "auto";
  pane.element.parentElement.style.height = "500px";
  const componentsFolder = pane.addFolder({
    title: "Components",
    expanded: false
  });
  Object.entries(defaultGameConfig.components).forEach(([componentId, properties]) => {
    const parentString = `components.${componentId}`;
    // fill localization with default en values
    const sampleLocalizationValue = _.get(properties, "localization.en", null);
    if (!_.isNil(sampleLocalizationValue)) {
      Object.keys(sampleLanguages).forEach((language) => {
        _.set(defaultGameConfig, `${parentString}.localization.${language}`, _.clone(sampleLocalizationValue));
      });
    }
  });

  Object.entries(defaultGameConfig.components).forEach(([componentId, properties]) => {
    if (_.includes(ignoredComponentIds, componentId)) return;

    const parentString = `components.${componentId}`;
    console.log(properties);
    const folder = componentsFolder.addFolder({
      title: componentId,
      expanded: false
    });

    addInputs({
      defaultGameConfig,
      gameConfig: tweakPaneGameConfig,
      pane: componentsFolder,
      object: properties,
      parentString,
      folder
    });

    componentsFolder.addBlade({
      view: "separator"
    });
  });

  const optionsFolder = pane.addFolder({
    title: "Options",
    expanded: false
  });

  addInputs({
    defaultGameConfig,
    gameConfig: tweakPaneGameConfig,
    pane,
    object: defaultGameConfig.options,
    parentString: "options",
    folder: optionsFolder
  });
  console.log({ tweakPaneGameConfig });
}

function onChange(gameConfig, path, value) {
  _.set(gameConfig, path, value);
  console.log("onchange", path, value, gameConfig);
  applyGameConfig(gameConfig);
}

function addInputs(props) {
  const defaultGameConfig = props.defaultGameConfig;
  const pane = props.pane;
  const object = props.object;
  const parentString = props.parentString;
  const folder = props.folder;
  const gameConfig = props.gameConfig;
  for (const key in object) {
    // console.log({ key, includes: _.includes(ignoredKeys, key) });
    if (_.includes(ignoredKeys, key)) continue;
    const value = object[key];

    if (_.isObject(value)) {
      // Create a folder for nested objects
      const subFolder = folder
        ? folder.addFolder({ title: key, expanded: false })
        : pane.addFolder({ title: key, expanded: false });
      addInputs({
        defaultGameConfig,
        gameConfig,
        pane,
        object: value,
        parentString: `${parentString}.${key}`,
        folder: subFolder
      });
    } else {
      const path = `${parentString}.${key}`;
      _.set(gameConfig, path, _.clone(_.get(defaultGameConfig, path)));
      // Add input based on the type of value
      if (typeof value === "boolean") {
        folder.addBinding(object, key).on("change", (e) => {
          onChange(gameConfig, path, e.value);
        });
      } else if (typeof value === "number") {
        const opt_params = _.includes(sliderKeys, key) ? { min: 0, max: 1 } : {};
        if (_.includes(_.toLower(key), _.toLower("color"))) {
          opt_params.view = "color";
          opt_params.picker = "inline";
          opt_params.expanded = true;
        }
        if (parentString === "options") {
          opt_params.min = 0;
          opt_params.max = 45;
          opt_params.step = 1;
        }
        folder.addBinding(object, key, opt_params).on("change", (e) => {
          onChange(gameConfig, path, e.value);
        });
      } else if (typeof value === "string") {
        if (parentString === "options" && key === "language") {
          const options = [];
          Object.entries(sampleLanguages).forEach(([key, value]) => {
            options.push({ text: value, value: key });
          });
          folder
            .addBlade({
              view: "list",
              label: key,
              options,
              value: "en"
            })
            .on("change", (e) => {
              const path = `${parentString}.${key}`;
              onChange(gameConfig, path, e.value);
            });
        } else {
          const opt_params = {};
          if (key === "fontColor") {
            opt_params.view = "color";
            opt_params.picker = "inline";
            opt_params.expanded = true;
          }
          folder.addBinding(object, key, opt_params).on("change", (e) => {
            onChange(gameConfig, path, e.value);
          });
        }
      }
    }
  }
}
