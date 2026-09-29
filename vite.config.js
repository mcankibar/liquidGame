import { defineConfig } from "vite";
import playable from "./playable/build/vite-plugin.js";

// Everything playable-specific (single-file build, data blocks, manifest) lives in the plugin.
export default defineConfig({
  plugins: [playable()],
  server: { host: "localhost", port: 5173 }
});
