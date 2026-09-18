"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "./cx";

/**
 * iOS inset-grouped list: a rounded card of rows separated by hairlines that
 * start after the leading tile (like Settings).
 */
export function GroupedList({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {header && <h2 className="ui-footnote mb-2 px-4 font-medium uppercase tracking-[0.04em] text-ink-2">{header}</h2>}
      {/* `ui-grouped` (globals.css) draws the inset hairline between rows. */}
      <div className="ui-grouped ui-stagger overflow-hidden rounded-card bg-surface shadow-card">{children}</div>
      {footer && <p className="ui-footnote mt-2 px-4 text-ink-2">{footer}</p>}
    </section>
  );
}

/**
 * One row. Renders as a Link (href), a button (onClick) or a plain div.
 * `leading` is usually a <Monogram />; the divider then starts after it.
 */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron = Boolean(href || onClick),
  disabled,
  className,
}: {
  href?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-medium tracking-[-0.01em] text-ink">{title}</div>
        {subtitle && <div className="ui-subhead mt-0.5 truncate text-ink-2">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 text-[15px] text-ink-2">{trailing}</div>}
      {chevron && <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ink-3" strokeWidth={2.4} />}
    </>
  );

  const cls = cx(
    "relative flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3 text-left",
    (href || onClick) && !disabled && "transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]",
    disabled && "opacity-50",
    className,
  );
  // Divider inset: aligns with the text when a leading tile is present.
  const style = leading ? ({ ["--inset" as string]: "78px" } as React.CSSProperties) : undefined;

  if (href && !disabled) {
    return (
      <Link href={href} className={cls} style={style}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
