import { definePreviewConfig } from "@agent-gui/preview-runtime/config";

export default definePreviewConfig({
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
});
