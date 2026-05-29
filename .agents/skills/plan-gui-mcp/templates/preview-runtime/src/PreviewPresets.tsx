import type { ReactNode } from "react";
import { PreviewPanel } from "./PreviewShell.js";

export type SingleScreenPreviewProps = {
  title: string;
  children: ReactNode;
};

export function SingleScreenPreview({ title, children }: SingleScreenPreviewProps) {
  return <PreviewPanel title={title}>{children}</PreviewPanel>;
}

export type BeforeAfterPreviewProps = {
  title?: string;
  beforeTitle?: string;
  afterTitle?: string;
  before: ReactNode;
  after: ReactNode;
};

export function BeforeAfterPreview({
  title = "Before / After",
  beforeTitle = "Before",
  afterTitle = "After",
  before,
  after,
}: BeforeAfterPreviewProps) {
  return (
    <PreviewPanel title={title}>
      <div className="preview-before-after">
        <section className="preview-before-after__pane">
          <h3>{beforeTitle}</h3>
          {before}
        </section>
        <section className="preview-before-after__pane">
          <h3>{afterTitle}</h3>
          {after}
        </section>
      </div>
    </PreviewPanel>
  );
}
