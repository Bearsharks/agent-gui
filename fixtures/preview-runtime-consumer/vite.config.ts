import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import previewConfig from "./agent-gui.preview.config";
import { agentGuiPreviewPlugin } from "@agent-gui/preview-runtime/vite";

export default defineConfig({
  plugins: [react(), agentGuiPreviewPlugin(previewConfig)],
});
