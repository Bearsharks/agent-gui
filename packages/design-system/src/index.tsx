import type { CSSProperties, ReactNode } from "react";

export const tokens = {
  color: {
    bg: "#f7f7f4",
    panel: "#ffffff",
    border: "#d7d8d2",
    text: "#242621",
    muted: "#6b6f64",
    accent: "#0f766e",
    accentSoft: "#d9f1ed",
    warn: "#a16207",
    danger: "#b91c1c",
  },
  radius: {
    sm: "6px",
    md: "8px",
  },
  shadow: "0 1px 3px rgba(20, 24, 18, 0.08)",
};

type BoxProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Card({ children, className, style }: BoxProps) {
  return (
    <section
      className={className}
      style={{
        background: tokens.color.panel,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.md,
        boxShadow: tokens.shadow,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  onClick,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const palette =
    disabled
      ? { background: "#e2e8f0", color: "#94a3b8", border: "#cbd5e1" }
      : variant === "primary"
        ? { background: tokens.color.accent, color: "white", border: tokens.color.accent }
        : variant === "danger"
          ? { background: "white", color: tokens.color.danger, border: "#f1b3b3" }
          : { background: "white", color: tokens.color.text, border: tokens.color.border };

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...palette,
        border: `1px solid ${palette.border}`,
        borderRadius: tokens.radius.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        font: "inherit",
        fontWeight: 650,
        minHeight: 34,
        padding: "7px 11px",
        transition: "all 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  const colors =
    tone === "accent"
      ? { background: tokens.color.accentSoft, color: "#115e59" }
      : tone === "warn"
        ? { background: "#fef3c7", color: tokens.color.warn }
        : { background: "#ecede8", color: tokens.color.muted };
  return (
    <span
      style={{
        ...colors,
        borderRadius: 999,
        display: "inline-flex",
        fontSize: 12,
        fontWeight: 650,
        lineHeight: 1,
        padding: "5px 8px",
      }}
    >
      {children}
    </span>
  );
}

export function Stack({ children, gap = 12 }: BoxProps & { gap?: number }) {
  return <div style={{ display: "grid", gap }}>{children}</div>;
}

export const ds = { Badge, Button, Card, Stack, tokens };
