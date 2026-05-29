import {
  BeforeAfterPreview,
  SingleScreenPreview,
  definePreview,
} from "@agent-gui/preview-runtime";
import "./search-panel.preview.css";

function SearchPanel({ state }: { state: "empty" | "results" }) {
  return (
    <div className="search-panel-preview">
      <label htmlFor={`search-${state}`}>Search</label>
      <input id={`search-${state}`} value={state === "empty" ? "" : "agent gui"} readOnly />
      {state === "empty" ? (
        <p className="search-panel-preview__empty">No query yet.</p>
      ) : (
        <ul>
          <li>Graph plan review session</li>
          <li>Iframe preview runtime</li>
          <li>Targeted feedback thread</li>
        </ul>
      )}
    </div>
  );
}

export default definePreview({
  id: "search-panel",
  title: "Search Panel Preview",
  description: "Prototype entry injected through the preview runtime CLI.",
  component() {
    return (
      <>
        <SingleScreenPreview title="Prototype component">
          <SearchPanel state="results" />
        </SingleScreenPreview>
        <BeforeAfterPreview
          beforeTitle="Empty"
          afterTitle="With results"
          before={<SearchPanel state="empty" />}
          after={<SearchPanel state="results" />}
        />
      </>
    );
  },
});
