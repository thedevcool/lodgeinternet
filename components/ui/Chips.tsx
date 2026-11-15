"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Horizontally scrolling row of chips that bleeds to the screen edge on mobile.
 *
 * A chip is 44 px tall to tap but its pill is drawn 36 px tall (see Chip), so
 * each chip carries 4 px of empty space above and below the pill. `-mt-1`
 * on the scroller takes back the space above; the space below is the room
 * the row always left for the pills' shadow. The row is as tall as it was.
 * `className` goes on a wrapper so a caller's own top margin (`mt-5`) can't
 * collide with that `-mt-1`.
 */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="ui-scroll-x -mx-4 -mt-1 flex gap-2 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:px-0">{children}</div>
    </div>
  );
}

// The tappable element: 44 px tall (standard F5), nothing drawn.
const CHIP = "group inline-flex h-11 shrink-0 snap-start items-center rounded-full outline-none";
// The pill inside it: what the customer sees, at the height it always was.
const PILL =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-medium " +
  "transition-[color,background-color,transform] duration-200 group-active:scale-[0.97] " +
  "group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent";
const OFF = "bg-surface text-ink shadow-card ring-1 ring-hairline group-hover:bg-surface-2";
const ON = "bg-ink text-canvas";

/**
 * A chip that is either a link (href) or a toggle (onClick + selected).
 *
 * The link or button is 44 px tall and invisible; the pill is a span inside
 * it. A 44 px pill looked heavy in a row of five, and a 36 px one was too
 * small a target.
 */
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
  const pill = <span className={cx(PILL, selected ? ON : OFF)}>{children}</span>;
  if (href) {
    return (
      <Link href={href} className={CHIP}>
        {pill}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={CHIP}>
      {pill}
    </button>
  );
}
