import type { ComponentType } from "react";
import ExamplePreview from "./example";

export const previewRegistry: Record<string, ComponentType> = {
  example: ExamplePreview,
};
