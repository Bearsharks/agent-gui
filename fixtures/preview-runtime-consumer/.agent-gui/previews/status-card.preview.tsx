import { SingleScreenPreview, definePreview } from "@agent-gui/preview-runtime";

function StatusCard() {
  return (
    <div
      style={{
        border: "1px solid #bae6fd",
        borderRadius: 8,
        display: "grid",
        gap: 8,
        padding: 14,
      }}
    >
      <strong>Runtime injection active</strong>
      <span>The dev server picked up this preview entry from the configured glob.</span>
    </div>
  );
}

export default definePreview({
  id: "status-card",
  title: "Status Card Preview",
  description: "Added while the preview runtime dev server was already running.",
  component() {
    return (
      <SingleScreenPreview title="Injected after startup">
        <StatusCard />
      </SingleScreenPreview>
    );
  },
});
