import path from "node:path";
import type { Plugin } from "vite";
import type { NormalizedPreviewRuntimeConfig } from "./config-loader.js";

const appEntryId = "/@agent-gui-preview-entry.tsx";
const resolvedAppEntryId = "\0agent-gui-preview-entry.tsx";
const setupId = "virtual:agent-gui-preview-setup";
const resolvedSetupId = `\0${setupId}`;

export function previewRuntimeAppPlugin(config: NormalizedPreviewRuntimeConfig): Plugin {
  return {
    name: "agent-gui-preview-app",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split("?")[0];

        if (url !== "/" && url !== "/index.html") {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html");
        response.end(renderIndexHtml());
      });
    },
    resolveId(id) {
      if (id === appEntryId) {
        return resolvedAppEntryId;
      }

      if (id === setupId) {
        return resolvedSetupId;
      }

      return undefined;
    },
    load(id) {
      if (id === resolvedAppEntryId) {
        return renderAppEntryModule();
      }

      if (id === resolvedSetupId) {
        return renderSetupModule(config);
      }

      return undefined;
    },
  };
}

function renderIndexHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent GUI Preview Runtime</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${appEntryId}"></script>
  </body>
</html>`;
}

function renderAppEntryModule() {
  return `
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewHost } from "@agent-gui/preview-runtime";

createRoot(document.getElementById("root")).render(
  React.createElement(StrictMode, null, React.createElement(PreviewHost)),
);
`;
}

function renderSetupModule(config: NormalizedPreviewRuntimeConfig) {
  const styleImports = (config.styles ?? [])
    .map((stylePath) => `import ${JSON.stringify(toFsPath(config.projectRoot, stylePath))};`)
    .join("\n");

  const setupImport = config.setup
    ? `import { PreviewProviders as ConfiguredPreviewProviders } from ${JSON.stringify(
        toFsPath(config.projectRoot, config.setup),
      )};`
    : "";

  const providerExport = config.setup
    ? "export const PreviewProviders = ConfiguredPreviewProviders;"
    : "export function PreviewProviders({ children }) { return children; }";

  return `${styleImports}
${setupImport}
${providerExport}
`;
}

function toFsPath(projectRoot: string, sourcePath: string) {
  const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(projectRoot, sourcePath);
  return `/@fs/${absolutePath}`;
}
