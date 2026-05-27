import type { ComponentType } from "react";
import TodoDecisionPreview from "./todo-decision";
import TodoPrdPreview from "./todo-prd";
import TodoProblemPreview from "./todo-problem";
import TodoPrototypePreview from "./todo-prototype";
import TodoSpecPreview from "./todo-spec";

export const previewRegistry: Record<string, ComponentType> = {
  "todo-problem": TodoProblemPreview,
  "todo-prd": TodoPrdPreview,
  "todo-spec": TodoSpecPreview,
  "todo-prototype": TodoPrototypePreview,
  "todo-decision": TodoDecisionPreview,
};
