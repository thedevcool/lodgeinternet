import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Solid content card (apple.com tile). Glass is reserved for floating chrome. */
export default function Card({
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cx("rounded-card bg-surface shadow-card", padded && "p-5 sm:p-6", className)} {...rest} />;
}
