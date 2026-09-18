import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Page-width wrapper with the standard side gutters (16px on phones). */
export default function Container({
  className,
  wide,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { wide?: boolean }) {
  return <div className={cx("mx-auto w-full px-4 sm:px-6 lg:px-8", wide ? "max-w-6xl" : "max-w-3xl", className)} {...rest} />;
}
