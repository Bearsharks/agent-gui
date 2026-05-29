#!/usr/bin/env node

import { loadPreviewRuntimeConfig } from "./config-loader.js";
import { startPreviewServer } from "./preview-server.js";

async function main() {
  const { command, projectRoot } = parseArgs(process.argv.slice(2));

  if (command === "dev") {
    const config = await loadPreviewRuntimeConfig(projectRoot);
    const server = await startPreviewServer(config);

    process.once("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });

    process.once("SIGTERM", async () => {
      await server.close();
      process.exit(0);
    });

    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
  console.log(`agent-gui-preview

Commands:
  agent-gui-preview dev   Start the local preview runtime server

Options:
  --project-root <path>   Target project root. Defaults to the current working directory.
`);
}

function parseArgs(args: string[]) {
  let command = "dev";
  let projectRoot = process.cwd();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      command = "help";
      continue;
    }

    if (arg === "--project-root") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("--project-root requires a path.");
      }

      projectRoot = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--project-root=")) {
      projectRoot = arg.slice("--project-root=".length);
      continue;
    }

    if (!arg.startsWith("-")) {
      command = arg;
      continue;
    }
  }

  return { command, projectRoot };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
