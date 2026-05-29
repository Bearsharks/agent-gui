/// <reference path="./vite-env.d.ts" />

import { previewRegistry } from "virtual:agent-gui-preview-registry";
import { PreviewProviders } from "virtual:agent-gui-preview-setup";
import { PreviewPanel, PreviewShell } from "./PreviewShell.js";

export function PreviewHost() {
  const previewId = new URLSearchParams(window.location.search).get("preview");
  const entry = previewId ? previewRegistry[previewId] : undefined;

  if (!previewId || !entry) {
    return (
      <PreviewProviders>
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
      </PreviewProviders>
    );
  }

  const Preview = entry.component;

  return (
    <PreviewProviders>
      <PreviewShell title={entry.title} description={entry.description}>
        <Preview />
      </PreviewShell>
    </PreviewProviders>
  );
}
