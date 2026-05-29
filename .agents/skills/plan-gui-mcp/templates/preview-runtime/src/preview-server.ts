import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer, type AliasOptions } from "vite";
import type { NormalizedPreviewRuntimeConfig } from "./config-loader.js";
import { previewRuntimeAppPlugin } from "./preview-app-plugin.js";
import { agentGuiPreviewPlugin } from "./vite.js";

const require = createRequire(import.meta.url);
const runtimeSrcRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimePackageEntry = path.join(runtimeSrcRoot, "index.ts");

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
  return [
    {
      find: "@agent-gui/preview-runtime",
      replacement: runtimePackageEntry,
    },
    {
      find: "react/jsx-runtime",
      replacement: require.resolve("react/jsx-runtime"),
    },
    {
      find: "react/jsx-dev-runtime",
      replacement: require.resolve("react/jsx-dev-runtime"),
    },
    {
      find: "react-dom/client",
      replacement: require.resolve("react-dom/client"),
    },
    {
      find: "react",
      replacement: require.resolve("react"),
    },
    {
      find: "react-dom",
      replacement: require.resolve("react-dom"),
    },
    ...Object.entries(aliases).map(([find, replacement]) => ({
      find,
      replacement: resolveProjectPath(projectRoot, replacement),
    })),
  ];
}

function resolveProjectPath(projectRoot: string, sourcePath: string) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(projectRoot, sourcePath);
}
