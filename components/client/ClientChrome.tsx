"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { PageChromeProvider } from "./PageChrome";
import NavBar from "./NavBar";
import TabBar from "./TabBar";
import Footer from "./Footer";

/**
 * Shared frame for every client page: nav bar, content, footer, tab bar, and
 * the #client-portal node that sheets render into (inside .client-root, so
 * tokens, dark mode and the font apply to them).
 *
 * Uses usePathname only — never useSearchParams (that would force every
 * static page to bail out of prerendering).
 */

// Focused flows are "pushed" screens — no tab bar (iOS hidesBottomBarWhenPushed).
const HIDE_TAB_BAR = [/^\/login/, /^\/register/, /^\/forgot-password/, /^\/maintenance/, /^\/waitlist/, /\/plans$/];

// During a lockdown every link leads back to /maintenance, so show no chrome.
const HIDE_NAV_AND_FOOTER = [/^\/maintenance/];

export default function ClientChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const showTabBar = !HIDE_TAB_BAR.some((rule) => rule.test(pathname));
  const showNavAndFooter = !HIDE_NAV_AND_FOOTER.some((rule) => rule.test(pathname));

  return (
    <PageChromeProvider>
      {showNavAndFooter && <NavBar />}
      <div
        className={cx(
          "flex flex-1 flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
          // leave room for the floating tab bar on phones
          showTabBar && "pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-0",
        )}
      >
        <main className="flex-1">{children}</main>
        {showNavAndFooter && <Footer />}
      </div>
      {showTabBar && <TabBar />}
      <div id="client-portal" />
    </PageChromeProvider>
  );
}
