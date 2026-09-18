import type { Viewport } from "next";
import type { ReactNode } from "react";
import { CustomerProvider } from "@/components/client/CustomerProvider";
import ClientChrome from "@/components/client/ClientChrome";
import WelcomeSheet from "@/components/client/WelcomeSheet";
import { THEME_INIT_SCRIPT } from "@/components/client/ThemeToggle";

/**
 * Layout for every customer-facing page (URLs are unchanged — "(client)" is a
 * route group). Kept as a Server Component so it can export `viewport`.
 * Admin lives outside this group and never gets this chrome, font or dark mode.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  viewportFit: "cover",
};

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div className="client-root flex min-h-dvh flex-col">
      {/* Apply a saved Light/Dark choice before first paint (no flash). */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <CustomerProvider>
        <ClientChrome>{children}</ClientChrome>
        <WelcomeSheet />
      </CustomerProvider>
    </div>
  );
}
