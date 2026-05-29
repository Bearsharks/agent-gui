import type { ComponentType } from "react";

export type PreviewComponent = ComponentType;

export type PreviewEntry = {
  id: string;
  title: string;
  description?: string;
  component: PreviewComponent;
};

export type PreviewRegistryEntry = PreviewEntry & {
  entryPath?: string;
};

export type PreviewRegistry = Record<string, PreviewRegistryEntry>;

export function definePreview(entry: PreviewEntry): PreviewEntry {
  return entry;
}

export function definePreviewRegistry(entries: unknown[], entryPaths: Record<string, string> = {}): PreviewRegistry {
  const registry: PreviewRegistry = {};

  for (const entry of entries) {
    assertPreviewEntry(entry);

    if (registry[entry.id]) {
      throw new Error(`Duplicate preview id: ${entry.id}`);
    }

    registry[entry.id] = {
      ...entry,
      entryPath: entryPaths[entry.id],
    };
  }

  return registry;
}

function assertPreviewEntry(value: unknown): asserts value is PreviewEntry {
  if (!value || typeof value !== "object") {
    throw new Error("Preview entry must be an object.");
  }

  const candidate = value as Partial<PreviewEntry>;

  if (!candidate.id || typeof candidate.id !== "string") {
    throw new Error("Preview entry requires a string id.");
  }

  if (!candidate.title || typeof candidate.title !== "string") {
    throw new Error(`Preview entry "${candidate.id}" requires a string title.`);
  }

  if (typeof candidate.component !== "function") {
    throw new Error(`Preview entry "${candidate.id}" requires a React component.`);
  }
}
