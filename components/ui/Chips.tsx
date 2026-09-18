"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Horizontally scrolling row of chips that bleeds to the screen edge on mobile. */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("ui-scroll-x -mx-4 flex gap-2 px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:px-0", className)}>
      {children}
    </div>
  );
}

const CHIP =
  "inline-flex h-9 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-medium " +
  "transition-colors duration-200 active:scale-[0.97]";
const OFF = "bg-surface text-ink shadow-card ring-1 ring-hairline hover:bg-surface-2";
const ON = "bg-ink text-canvas";

/** A chip that is either a link (href) or a toggle (onClick + selected). */
export function Chip({
  children,
  href,
  selected,
  onClick,
}: {
  children: ReactNode;
  href?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cls = cx(CHIP, selected ? ON : OFF);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cls}>
      {children}
    </button>
  );
}
