import path from "node:path";
import { createServer, type AliasOptions } from "vite";
import type { NormalizedPreviewRuntimeConfig } from "./config-loader.js";
import { previewRuntimeAppPlugin } from "./preview-app-plugin.js";
import { agentGuiPreviewPlugin } from "./vite.js";

export async function startPreviewServer(config: NormalizedPreviewRuntimeConfig) {
  const server = await createServer({
    root: config.projectRoot,
    configFile: false,
    publicDir: config.publicDir ? resolveProjectPath(config.projectRoot, config.publicDir) : undefined,
    resolve: {
      alias: normalizeAliases(config.projectRoot, config.aliases),
    },
    server: {
      host: config.devServer?.host ?? "127.0.0.1",
      port: config.devServer?.port ?? 5174,
      strictPort: true,
      watch: config.watch,
    },
    plugins: [previewRuntimeAppPlugin(config), agentGuiPreviewPlugin(config)],
  });

  await server.listen();
  server.printUrls();

  return server;
}

function normalizeAliases(projectRoot: string, aliases: Record<string, string> = {}): AliasOptions {
  return Object.entries(aliases).map(([find, replacement]) => ({
    find,
    replacement: resolveProjectPath(projectRoot, replacement),
  }));
}

function resolveProjectPath(projectRoot: string, sourcePath: string) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(projectRoot, sourcePath);
}
