import _ from "lodash-es";
import { BasePerspectiveComponent } from "../perspectiveComponents/basePerspectiveComponent";

// This is a SPECIAL component.
// ThifontUs component's only responsibility is to add given fonts to document's head tag's style element.
// So that any text can use these fonts.
export class FontUploader extends BasePerspectiveComponent {
  constructor(props) {
    super(props);
    super.update(props);
    this.fontsLoadStatuses = new Map();
  }

  load() {
    super.load();
    //console.debug(Object.entries(this.fonts));
    if (!_.isNil(this.fonts) && Object.keys(this.fonts).length > 0) {
      Object.entries(this.fonts).forEach(([key, value]) => {
        if (_.isNil(this.fontsLoadStatuses.get(value.fontFamily))) {
          let styleElement = document.createElement("style");
          document.head.appendChild(styleElement);
          if (_.has(value, "data")) {
            styleElement.appendChild(
              document.createTextNode(`
               @font-face {
                  font-family: "${value.fontFamily}";
                  src: url("${value.data}");
               }`)
            );
          } 
          else if (_.has(value, "assetPath")) {
            styleElement.appendChild(
              document.createTextNode(`
               @font-face {
                  font-family: "${value.fontFamily}";
                  src: url("./assets/${value.assetPath}");
               }`)
            );
          } 
          else if (_.has(value, "file")) {
            styleElement.appendChild(
              document.createTextNode(`
               @font-face {
                  font-family: "${value.fontFamily}";
                  src: url("./fonts/${value.file}");
               }`)
            );
          }
          this.fontsLoadStatuses.set(value.fontFamily, false);
        }
      });
      //console.debug(document.fonts);
      document.fonts.forEach((value, key, set) => {
        console.debug(value, key, set);
        // According to https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load,
        // need to provide font size to load font.
        if (!this.fontsLoadStatuses.get(value.family)) {
          document.fonts.load("1em " + value.family);
        }
      });
      //whenever load function of this component executed, ready returns a promise.
      document.fonts.ready.then(() => {
        if (Array.from(this.fontsLoadStatuses.values()).every((value) => value === true)) {
          this.onReady();
        } else {
          Object.entries(this.fonts).forEach(([key, value]) => {
            this.fontsLoadStatuses.set(value.fontFamily, true);
            console.debug(key, value);
          });
          this.onReady();
        }
      });
    } else {
      this.onReady();
    }
  }

  render() {}

  onReady() {
    this.isCustomFontLoadComplete = true;
    super.onReady();
  }
}