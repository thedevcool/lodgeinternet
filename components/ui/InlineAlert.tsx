import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cx } from "./cx";

/** Inline message box for errors / notices inside a page, card or sheet. */
export default function InlineAlert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "warning" | "info";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
    info: "bg-accent/10 text-accent-ink",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-2xl px-4 py-3", styles, className)}>
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
      <div className="ui-subhead min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title && "mt-0.5 opacity-90")}>{children}</div>
      </div>
    </div>
  );
}
