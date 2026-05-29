/// <reference path="./vite-env.d.ts" />

import { previewRegistry } from "virtual:agent-gui-preview-registry";
import { PreviewPanel, PreviewShell } from "./PreviewShell";

export function PreviewHost() {
  const previewId = new URLSearchParams(window.location.search).get("preview");
  const entry = previewId ? previewRegistry[previewId] : undefined;

  if (!previewId || !entry) {
    return (
      <PreviewShell
        title={previewId ? "Preview Not Found" : "Preview Runtime"}
        description={previewId ? `No preview registered for "${previewId}".` : "Select a registered preview."}
      >
        <PreviewPanel title="Registered previews">
          {Object.keys(previewRegistry).length > 0 ? (
            <ul>
              {Object.entries(previewRegistry).map(([id, registeredEntry]) => (
                <li key={id}>
                  <a href={`/?preview=${encodeURIComponent(id)}`}>{id}</a>
                  <span> - {registeredEntry.title}</span>
                  {registeredEntry.entryPath ? <small>{registeredEntry.entryPath}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No preview entries matched the configured entry patterns.</p>
          )}
        </PreviewPanel>
      </PreviewShell>
    );
  }

  const Preview = entry.component;

  return (
    <PreviewShell title={entry.title} description={entry.description}>
      <Preview />
    </PreviewShell>
  );
}
