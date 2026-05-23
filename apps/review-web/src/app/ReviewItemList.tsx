import { Badge } from "@agent-gui/design-system";
import { labelStatus } from "./graphReviewLabels";

export function ReviewItemList({
  items,
  onItemClick,
}: {
  items: { id: string; label: string; status?: string; meta?: string }[];
  onItemClick?: (id: string) => void;
}) {
  return (
    <div className="item-list">
      {items.map((item) => (
        <button
          className="item-row"
          key={item.id}
          onClick={
            onItemClick
              ? (event) => {
                  event.stopPropagation();
                  onItemClick(item.id);
                }
              : undefined
          }
        >
          <span>{item.label}</span>
          <span className="item-meta">
            {item.meta ? <em>{labelStatus(item.meta)}</em> : null}
            {item.status ? <Badge>{labelStatus(item.status)}</Badge> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
