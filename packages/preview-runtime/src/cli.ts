#!/usr/bin/env node

import { loadPreviewRuntimeConfig } from "./config-loader.js";
import { startPreviewServer } from "./preview-server.js";

async function main() {
  const [command = "dev"] = process.argv.slice(2);

  if (command === "dev") {
    const config = await loadPreviewRuntimeConfig(process.cwd());
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
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
