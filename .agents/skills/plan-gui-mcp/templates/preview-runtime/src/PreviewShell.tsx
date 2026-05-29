import type { ReactNode } from "react";
import "./preview-runtime.css";

export type PreviewShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function PreviewShell({ title, description, children }: PreviewShellProps) {
  return (
    <main className="preview-shell">
      <header className="preview-shell__header">
        <span className="preview-shell__eyebrow">project-owned preview</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      <section className="preview-shell__grid">{children}</section>
    </main>
  );
}

export type PreviewPanelProps = {
  title: string;
  children: ReactNode;
};

export function PreviewPanel({ title, children }: PreviewPanelProps) {
  return (
    <article className="preview-panel">
      <h2>{title}</h2>
      <div className="preview-panel__body">{children}</div>
    </article>
  );
}
