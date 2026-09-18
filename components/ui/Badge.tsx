import type { ReactNode } from "react";
import { cx } from "./cx";

/** Small status pill, optionally with a coloured dot (e.g. "● Active"). */
type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "wa";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-ink/[0.06] text-ink-2", dot: "bg-ink-3" },
  accent: { pill: "bg-accent/10 text-accent-ink", dot: "bg-accent-ink" },
  success: { pill: "bg-success/10 text-success", dot: "bg-success" },
  warning: { pill: "bg-warning/10 text-warning", dot: "bg-warning" },
  danger: { pill: "bg-danger/10 text-danger", dot: "bg-danger" },
  wa: { pill: "bg-wa/10 text-wa-ink", dot: "bg-wa-ink" },
};

export default function Badge({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none",
        t.pill,
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}
