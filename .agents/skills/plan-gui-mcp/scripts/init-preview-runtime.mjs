#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const skillRoot = path.resolve(path.dirname(scriptPath), "..");
const templatesRoot = path.join(skillRoot, "templates");

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(process.cwd(), args.projectRoot);
const agentGuiRoot = path.join(projectRoot, ".agent-gui");
const runtimeRoot = path.join(agentGuiRoot, "preview-runtime");
const previewsRoot = path.join(agentGuiRoot, "previews");

const operations = [];

ensureDirectory(agentGuiRoot);
ensureDirectory(previewsRoot);

copyFileIfNeeded(
  path.join(templatesRoot, "preview.config.ts"),
  path.join(agentGuiRoot, "preview.config.ts"),
  { overwrite: args.force },
);

copyFileIfNeeded(
  path.join(templatesRoot, "previews", "example.preview.tsx"),
  path.join(previewsRoot, "example.preview.tsx"),
  { overwrite: args.force },
);

copyDirectoryIfNeeded(
  path.join(templatesRoot, "preview-runtime"),
  runtimeRoot,
  { overwrite: args.force || args.upgradeRuntime },
);

printSummary();

function parseArgs(argv) {
  const parsed = {
    force: false,
    projectRoot: ".",
    upgradeRuntime: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--upgrade-runtime") {
      parsed.upgradeRuntime = true;
      continue;
    }

    if (arg === "--project-root") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error("--project-root requires a path.");
      }

      parsed.projectRoot = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--project-root=")) {
      parsed.projectRoot = arg.slice("--project-root=".length);
    }
  }

  return parsed;
}

function ensureDirectory(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    return;
  }

  fs.mkdirSync(directoryPath, { recursive: true });
  operations.push(`created ${relative(directoryPath)}`);
}

function copyFileIfNeeded(sourcePath, targetPath, options) {
  if (fs.existsSync(targetPath) && !options.overwrite) {
    operations.push(`kept ${relative(targetPath)}`);
    return;
  }

  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  operations.push(`${fs.existsSync(targetPath) ? "wrote" : "created"} ${relative(targetPath)}`);
}

function copyDirectoryIfNeeded(sourcePath, targetPath, options) {
  if (fs.existsSync(targetPath)) {
    if (!options.overwrite) {
      operations.push(`kept ${relative(targetPath)}`);
      return;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.cpSync(sourcePath, targetPath, { recursive: true });
  operations.push(`wrote ${relative(targetPath)}`);
}

function printSummary() {
  console.log("Agent GUI preview runtime scaffold complete.");
  console.log("");
  console.log("Project root:");
  console.log(`  ${projectRoot}`);
  console.log("");
  console.log("Changes:");

  for (const operation of operations) {
    console.log(`  - ${operation}`);
  }

  console.log("");
  console.log("Next commands:");
  console.log("  npm --prefix .agent-gui/preview-runtime install");
  console.log("  npm --prefix .agent-gui/preview-runtime run dev");
  console.log("");
  console.log("Preview URL:");
  console.log("  http://127.0.0.1:5174/?preview=example");
}

function relative(targetPath) {
  return path.relative(projectRoot, targetPath) || ".";
}
