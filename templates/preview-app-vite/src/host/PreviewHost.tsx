import { previewRegistry } from "../previews/registry";
import { PreviewPanel, PreviewShell } from "./PreviewShell";

export function PreviewHost() {
  const previewId = new URLSearchParams(window.location.search).get("preview") ?? "example";
  const Preview = previewRegistry[previewId];

  if (!Preview) {
    return (
      <PreviewShell title="Preview Not Found" description={`No preview registered for "${previewId}".`}>
        <PreviewPanel title="Registered previews">
          <ul>
            {Object.keys(previewRegistry).map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </PreviewPanel>
      </PreviewShell>
    );
  }

  return <Preview />;
}
