"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import BrandMark from "@/components/ui/BrandMark";
import { ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { useChromeState } from "./PageChrome";
import { useCustomer } from "./CustomerProvider";
import ThemeToggle from "./ThemeToggle";

/**
 * Top bar for every client page.
 *   Mobile:  brand (or a back chevron on nested pages) · inline title that
 *            fades in when the large title scrolls away · Sign in / avatar.
 *   Desktop: brand · Home, Hostels, Support · Sign in + Get started / Account.
 * Transparent at the top of the page; turns to glass with a hairline edge once
 * content scrolls under it (iOS 27 hard scroll edge).
 */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/hostels", label: "Hostels" },
  { href: "/support", label: "Support" },
];

export default function NavBar() {
  const pathname = usePathname() ?? "/";
  const { chrome, largeTitleHidden } = useChromeState();
  const { user } = useCustomer();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initial = (user?.email?.[0] || "A").toUpperCase();
  // Already on an auth page: a "Sign in" link here would be noise.
  const onAuthPage = /^\/(login|register|forgot-password)/.test(pathname);

  return (
    <header
      className={cx(
        "sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-300",
        scrolled ? "ui-glass-bar" : "bg-transparent",
      )}
    >
      <div className="relative mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: back chevron (mobile, nested pages) or brand */}
        <div className="flex min-w-0 flex-1 items-center md:flex-none">
          {chrome.back && (
            <Link
              href={chrome.back.href}
              className="-ml-2 inline-flex h-10 max-w-[45vw] items-center gap-0.5 rounded-full pr-2 text-[17px] text-accent-ink md:hidden"
            >
              <ChevronLeft className="h-7 w-7 shrink-0" strokeWidth={2.2} />
              <span className="truncate">{chrome.back.label ?? "Back"}</span>
            </Link>
          )}
          <span className={cx(chrome.back && "hidden md:inline-flex")}>
            <BrandMark />
          </span>
        </div>

        {/* Centre (mobile): inline title after the large title scrolls away */}
        {chrome.title && (
          <div
            aria-hidden={!largeTitleHidden}
            className={cx(
              "pointer-events-none absolute left-1/2 max-w-[46%] -translate-x-1/2 truncate text-[17px] font-semibold tracking-[-0.01em] text-ink transition-opacity duration-200 md:hidden",
              largeTitleHidden ? "opacity-100" : "opacity-0",
            )}
          >
            {chrome.title}
          </div>
        )}

        {/* Centre (desktop): primary navigation */}
        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cx(
                "rounded-full px-4 py-2 text-[15px] transition-colors",
                isActive(l.href) ? "bg-ink/[0.06] font-semibold text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right: account */}
        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <ThemeToggle className="mr-1 hidden lg:inline-flex" />
          {user ? (
            <>
              <Link
                href="/dashboard"
                aria-label="Your account"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-[15px] font-semibold text-accent-ink md:hidden"
              >
                {initial}
              </Link>
              <ButtonLink href="/dashboard" variant="gray" size="sm" className="hidden md:inline-flex">
                Account
              </ButtonLink>
            </>
          ) : onAuthPage ? null : (
            <>
              <ButtonLink href="/login" variant="plain" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" variant="filled" size="sm" className="hidden md:inline-flex">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
