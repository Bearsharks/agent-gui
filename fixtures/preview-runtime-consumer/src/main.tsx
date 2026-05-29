import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewHost } from "@agent-gui/preview-runtime";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewHost />
  </StrictMode>,
);
