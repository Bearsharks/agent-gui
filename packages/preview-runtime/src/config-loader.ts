import fs from "node:fs";
import path from "node:path";
import { loadConfigFromFile } from "vite";
import type { PreviewRuntimeConfig } from "./config.js";

const defaultConfigPath = path.join(".agent-gui", "preview.config.ts");

export async function loadPreviewRuntimeConfig(cwd: string, configPath = defaultConfigPath) {
  const resolvedConfigPath = path.resolve(cwd, configPath);

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(`Preview config not found: ${path.relative(cwd, resolvedConfigPath)}`);
  }

  const loaded = await loadConfigFromFile(
    {
      command: "serve",
      mode: "development",
    },
    resolvedConfigPath,
    cwd,
  );

  if (!loaded) {
    throw new Error(`Failed to load preview config: ${path.relative(cwd, resolvedConfigPath)}`);
  }

  return normalizePreviewRuntimeConfig(cwd, loaded.config as PreviewRuntimeConfig);
}

export type NormalizedPreviewRuntimeConfig = PreviewRuntimeConfig & {
  projectRoot: string;
};

function normalizePreviewRuntimeConfig(cwd: string, config: PreviewRuntimeConfig): NormalizedPreviewRuntimeConfig {
  if (!Array.isArray(config.entries) || config.entries.length === 0) {
    throw new Error("Preview config requires at least one entries glob.");
  }

  const projectRoot = path.resolve(cwd, config.root ?? ".");

  return {
    ...config,
    projectRoot,
  };
}
