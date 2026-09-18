"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * iOS segmented control. Each option is either a button (onSelect) or a link
 * (href) — the auth pages use links so Log in ⇄ Create account are real routes.
 */
export type Segment = { value: string; label: ReactNode; href?: string };

export default function SegmentedControl({
  segments,
  value,
  onSelect,
  className,
  ariaLabel,
}: {
  segments: Segment[];
  value: string;
  onSelect?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx("relative flex w-full rounded-full bg-ink/[0.06] p-1", className)}
    >
      {/* sliding thumb (iOS 27) */}
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-surface shadow-[0_2px_8px_rgb(0_0_0/0.12)] transition-transform duration-500 ease-spring"
        style={{
          width: `calc((100% - 8px) / ${segments.length})`,
          transform: `translateX(${Math.max(0, segments.findIndex((s) => s.value === value)) * 100}%)`,
        }}
      />
      {segments.map((s) => {
        const active = s.value === value;
        const cls = cx(
          "relative flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition-colors duration-300",
          active ? "text-ink" : "text-ink-2 hover:text-ink",
        );
        if (s.href) {
          return (
            <Link key={s.value} href={s.href} role="tab" aria-selected={active} className={cls}>
              {s.label}
            </Link>
          );
        }
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(s.value)}
            className={cls}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
