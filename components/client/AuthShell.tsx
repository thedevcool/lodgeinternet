import type { ReactNode } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Spinner from "@/components/ui/Spinner";

/**
 * Frame for the auth pages (Figma "Sign in" / "Create account"):
 * phones get a full-screen large-title form; desktop gets the centred card.
 * `tabs` shows the Log in ⇄ Create account switch (real links, so the URL
 * and back button behave).
 */
export default function AuthShell({
  tabs,
  icon,
  title,
  subtitle,
  children,
}: {
  tabs?: "login" | "register";
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[460px] px-4 pb-16 pt-2 sm:px-6 md:pt-12">
      <div className="md:rounded-sheet md:bg-surface md:p-8 md:shadow-card">
        {tabs && (
          <SegmentedControl
            ariaLabel="Account"
            value={tabs}
            segments={[
              { value: "login", label: "Log in", href: "/login" },
              { value: "register", label: "Create Account", href: "/register" },
            ]}
            className="mb-7"
          />
        )}
        <div className="mb-7 md:text-center">
          {icon && (
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white md:mx-auto">
              {icon}
            </span>
          )}
          <h1 className="ui-large-title text-ink md:text-[30px] md:leading-9">{title}</h1>
          {subtitle && <div className="ui-callout mt-2 text-ink-2">{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Suspense fallback for pages that read search params. */
export function AuthFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-ink-2">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
