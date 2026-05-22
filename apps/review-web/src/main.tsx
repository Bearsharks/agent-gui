import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { SessionReviewPage } from "./app/SessionReviewPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionReviewPage />
  </React.StrictMode>,
);
