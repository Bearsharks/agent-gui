import { SingleScreenPreview, definePreview } from "@agent-gui/preview-runtime";

function ExamplePrototype() {
  return (
    <div
      style={{
        border: "1px solid #d9d0c1",
        borderRadius: 8,
        display: "grid",
        gap: 8,
        padding: 14,
      }}
    >
      <strong>Agent GUI preview runtime</strong>
      <span>Replace this entry with a project-specific prototype.</span>
    </div>
  );
}

export default definePreview({
  id: "example",
  title: "Example Prototype",
  description: "Scaffolded preview entry for Agent GUI iframe review.",
  component() {
    return (
      <SingleScreenPreview title="Scaffolded preview">
        <ExamplePrototype />
      </SingleScreenPreview>
    );
  },
});
