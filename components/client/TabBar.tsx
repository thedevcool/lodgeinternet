"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, CircleUserRound, Headset, House, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { useCustomer } from "./CustomerProvider";

/**
 * Floating Liquid Glass tab bar (mobile only).
 * Minimizes while scrolling down (labels tuck away) and restores on scroll up.
 */
type TabKey = "home" | "hostels" | "support" | "account";

/** Which tab a URL belongs to. Location pages (/{slug}) count as "Hostels". */
function activeTab(pathname: string): TabKey {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/support")) return "support";
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/login")) return "account";
  return "hostels";
}

export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const { user } = useCustomer();
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 6) return; // ignore jitter
      setCompact(y > lastY && y > 80);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const tabs: Array<{ key: TabKey; href: string; label: string; icon: LucideIcon }> = [
    { key: "home", href: "/", label: "Home", icon: House },
    { key: "hostels", href: "/hostels", label: "Hostels", icon: Building2 },
    { key: "support", href: "/support", label: "Support", icon: Headset },
    { key: "account", href: user ? "/dashboard" : "/login", label: "Account", icon: CircleUserRound },
  ];
  const current = activeTab(pathname);
  const currentIndex = tabs.findIndex((t) => t.key === current);

  return (
    <nav
      aria-label="Tabs"
      className={cx(
        "ui-glass fixed left-1/2 z-40 flex -translate-x-1/2 rounded-full p-1.5 transition-all duration-300 ease-ios md:hidden",
        "bottom-[calc(env(safe-area-inset-bottom)+10px)]",
        compact ? "w-[min(300px,calc(100%-48px))]" : "w-[min(420px,calc(100%-24px))]",
      )}
    >
      {/* The selection pill glides between tabs with a slight spring. */}
      <span
        aria-hidden
        className="absolute bottom-1.5 left-1.5 top-1.5 rounded-full bg-ink/[0.08] transition-transform duration-500 ease-spring"
        style={{ width: `calc((100% - 12px) / ${tabs.length})`, transform: `translateX(${currentIndex * 100}%)` }}
      />
      {tabs.map(({ key, href, label, icon: Icon }) => {
        const active = key === current;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex flex-1 flex-col items-center justify-center rounded-full transition-all duration-300 ease-ios active:scale-90",
              compact ? "h-10" : "h-[52px]",
              active ? "text-accent-ink" : "text-ink-2",
            )}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
            <span
              className={cx(
                "overflow-hidden text-[10px] font-semibold leading-3 tracking-[0.01em] transition-all duration-300",
                compact ? "max-h-0 opacity-0" : "mt-1 max-h-3 opacity-100",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
