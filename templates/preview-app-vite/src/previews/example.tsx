import { PreviewPanel, PreviewShell } from "../host/PreviewShell";

export default function ExamplePreview() {
  return (
    <PreviewShell
      title="Example Preview"
      description="Replace this placeholder with project-owned preview TSX files."
    >
      <PreviewPanel title="Injection Boundary">
        <ul>
          <li>Add project previews under `src/previews`.</li>
          <li>Register each preview in `src/previews/registry.ts`.</li>
          <li>Open with `?preview=example` or your registered preview id.</li>
        </ul>
      </PreviewPanel>
      <PreviewPanel title="Agent GUI iframe URL">
        <p>Use a local explicit-port HTTP URL such as `http://127.0.0.1:5173/?preview=example`.</p>
      </PreviewPanel>
    </PreviewShell>
  );
}
