import { initialize } from "./main";

initialize();

if (import.meta.env.DEV) {
  // Dev-only side panel to try editable fields the way the Studio will (not part of builds).
  import("../playable/dev/panel.js").then(({ mountDevPanel }) => mountDevPanel());
}
