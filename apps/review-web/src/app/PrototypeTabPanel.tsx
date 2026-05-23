import { Badge } from "@agent-gui/design-system";
import { blockKey, breadcrumbForTarget, targetKey, type GraphIndex, type GraphSelection } from "./graphReviewModel";
import { ReviewItemList } from "./ReviewItemList";

export function PrototypeTabPanel({ index, selection, onSelect }: { index: GraphIndex; selection: GraphSelection; onSelect: (selection: GraphSelection) => void }) {
  const block = selection.nodeId && selection.blockId ? index.blocksByKey.get(blockKey(selection.graphId, selection.nodeId, selection.blockId)) : undefined;
  if (!block || block.type !== "prototype") return null;
  const selectedTab = block.tabs.find((tab) => tab.id === selection.tabId) ?? block.tabs[0];
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>프로토타입 탭</h3>
        <Badge>{block.tabs.length}</Badge>
      </div>
      <ReviewItemList
        items={block.tabs.map((tab) => ({ id: tab.id, label: tab.title, status: `${tab.relatedTargets?.length ?? 0}개 연결`, meta: tab.summary }))}
        onItemClick={(tabId) => onSelect({ graphId: selection.graphId, nodeId: selection.nodeId, blockId: selection.blockId, prototypeId: block.prototypeId, tabId })}
      />
      {selectedTab ? (
        <div className="prototype-tab-detail">
          <strong>{selectedTab.title}</strong>
          <span>{selectedTab.url}</span>
          {selectedTab.context ? <span>맥락: {[selectedTab.context.graphId, selectedTab.context.nodeId, selectedTab.context.blockId, selectedTab.context.itemId].filter(Boolean).join(" / ")}</span> : null}
          {(selectedTab.relatedTargets?.length ?? 0) > 0 ? (
            <ul>
              {(selectedTab.relatedTargets ?? []).map((relation, relationIndex) => (
                <li key={`${relation.purpose}:${relationIndex}:${targetKey(relation.target)}`}>
                  {relation.note ? `${relation.note}: ` : ""}
                  {breadcrumbForTarget(relation.target, index)}
                </li>
              ))}
            </ul>
          ) : (
            <span>연결 대상 없음</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
