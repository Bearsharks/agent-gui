declare module "virtual:agent-gui-preview-registry" {
  export const previewRegistry: import("./preview-entry").PreviewRegistry;
}

declare module "virtual:agent-gui-preview-setup" {
  import type { ReactNode } from "react";

  export function PreviewProviders(props: { children: ReactNode }): ReactNode;
}
