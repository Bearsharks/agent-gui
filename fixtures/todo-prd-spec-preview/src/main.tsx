import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewHost } from "./host/PreviewHost";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewHost />
  </StrictMode>,
);
