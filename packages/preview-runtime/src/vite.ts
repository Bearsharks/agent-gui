import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import type { PreviewRuntimeConfig } from "./config";

const virtualModuleId = "virtual:agent-gui-preview-registry";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

export function agentGuiPreviewPlugin(previewConfig: PreviewRuntimeConfig): Plugin {
  let viteConfig: ResolvedConfig;

  return {
    name: "agent-gui-preview-runtime",
    config(config) {
      return {
        server: {
          host: previewConfig.devServer?.host ?? config.server?.host,
          port: previewConfig.devServer?.port ?? config.server?.port,
          strictPort: true,
        },
      };
    },
    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }

      return undefined;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return undefined;
      }

      return buildVirtualRegistryModule(viteConfig.root, previewConfig.entries);
    },
  };
}

function buildVirtualRegistryModule(root: string, entries: string[]) {
  const globPatterns = entries.map((entryPattern) => toViteRootGlob(root, entryPattern));
  const serializedPatterns =
    globPatterns.length === 1 ? JSON.stringify(globPatterns[0]) : JSON.stringify(globPatterns);

  return `
import { definePreviewRegistry } from "@agent-gui/preview-runtime";

const modules = import.meta.glob(${serializedPatterns}, {
  eager: true,
  import: "default",
});

const entryPaths = Object.fromEntries(
  Object.entries(modules).map(([modulePath, entry]) => [
    entry.id,
    modulePath.replace(/^\\//, ""),
  ]),
);

export const previewRegistry = definePreviewRegistry(Object.values(modules), entryPaths);
`;
}

function toViteRootGlob(root: string, entryPattern: string) {
  if (entryPattern.startsWith("/")) {
    return entryPattern;
  }

  const absolutePattern = path.resolve(root, entryPattern);
  const relativePattern = path.relative(root, absolutePattern).split(path.sep).join("/");

  return `/${relativePattern}`;
}
