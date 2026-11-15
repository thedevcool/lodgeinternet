import type { ReactNode } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Spinner from "@/components/ui/Spinner";

/**
 * Frame for the auth pages (Figma "Sign in" / "Create account"):
 * phones get a full-screen large-title form; desktop gets the centred card.
 * `tabs` shows the Log in ⇄ Create account switch (real links, so the URL
 * and back button behave).
 *
 * `redirect` is where the visitor was heading (a plans page, when Pay sent
 * them here). The two tabs carry it across, so switching from "Create
 * Account" to "Log in" still ends back on that page and not the dashboard.
 */
export default function AuthShell({
  tabs,
  redirect,
  icon,
  title,
  subtitle,
  children,
}: {
  tabs?: "login" | "register";
  redirect?: string | null;
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const carried = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  return (
    <div className="mx-auto w-full max-w-[460px] px-4 pb-16 pt-2 sm:px-6 md:pt-12">
      <div className="md:rounded-sheet md:bg-surface md:p-8 md:shadow-card">
        {tabs && (
          <SegmentedControl
            ariaLabel="Account"
            value={tabs}
            segments={[
              { value: "login", label: "Log in", href: `/login${carried}` },
              { value: "register", label: "Create Account", href: `/register${carried}` },
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
