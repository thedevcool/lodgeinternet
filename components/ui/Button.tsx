"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import Spinner from "./Spinner";

/**
 * Capsule buttons in the iOS 27 style.
 *
 *   filled — primary action (blue, white text)
 *   tinted — secondary action (blue text on a soft blue fill)
 *   gray   — neutral action (ink text on a soft grey fill)
 *   plain  — text-only link-style action
 *   wa     — WhatsApp green
 *   danger — destructive text-only action
 *
 * Every variant/size maps to a full literal class string so Tailwind keeps it.
 */
type Variant = "filled" | "tinted" | "gray" | "plain" | "wa" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  filled: "bg-accent text-white hover:bg-accent/90",
  tinted: "bg-accent/10 text-accent-ink hover:bg-accent/15",
  gray: "bg-ink/[0.06] text-ink hover:bg-ink/10",
  plain: "bg-transparent text-accent-ink hover:bg-accent/10",
  wa: "bg-wa text-white hover:bg-wa/90",
  danger: "bg-transparent text-danger hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[15px] gap-1.5",
  md: "h-11 px-5 text-[16px] gap-2",
  lg: "h-[52px] px-6 text-[17px] gap-2",
};

const BASE =
  "inline-flex select-none items-center justify-center rounded-full font-semibold tracking-[-0.01em] " +
  "transition-[transform,background-color,opacity] duration-200 ease-ios active:scale-[0.97] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:pointer-events-none disabled:opacity-40";

function classes(variant: Variant, size: Size, full?: boolean, className?: string) {
  return cx(BASE, VARIANTS[variant], SIZES[size], full && "w-full", className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  loading?: boolean;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "filled", size = "lg", full, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes(variant, size, full, className)}
      {...rest}
    >
      {loading && <Spinner className="h-[18px] w-[18px]" />}
      {children}
    </button>
  );
});

export default Button;

/** Same look as Button, for navigation (Next.js Link or external href). */
export function ButtonLink({
  href,
  variant = "filled",
  size = "lg",
  full,
  external,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  external?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = classes(variant, size, full, className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
