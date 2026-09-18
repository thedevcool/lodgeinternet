"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useChromeState, usePageChrome, type BackLink } from "@/components/client/PageChrome";
import { cx } from "./cx";

/**
 * Page title block: breadcrumb (PROPERTIES › MODARE), large title, subtitle.
 * On mobile, once the large title scrolls under the nav bar the bar shows the
 * title inline (iOS large-title collapse).
 */
export type Crumb = { label: string; href?: string };

export default function PageHeader({
  title,
  subtitle,
  crumbs,
  back,
  aside,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  crumbs?: Crumb[];
  back?: BackLink;
  aside?: ReactNode;
  className?: string;
}) {
  usePageChrome(title, back);
  const { setLargeTitleHidden } = useChromeState();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Watch the large title; hidden = it has scrolled up under the ~56px bar.
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setLargeTitleHidden(!entry.isIntersecting && entry.boundingClientRect.top < 60),
      { rootMargin: "-60px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [setLargeTitleHidden]);

  return (
    <header className={cx("pb-6 pt-2 md:pb-8 md:pt-10", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="ui-eyebrow mb-2 flex flex-wrap items-center gap-1 text-ink-2">
          {crumbs.map((c, i) => (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-3" strokeWidth={2.6} />}
              {c.href ? (
                <Link href={c.href} className="text-accent-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-ink">{c.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 ref={titleRef} className="ui-large-title text-ink md:text-[44px] md:leading-[50px]">
          {title}
        </h1>
        {aside}
      </div>
      {subtitle && <p className="ui-body mt-2 max-w-2xl text-ink-2">{subtitle}</p>}
    </header>
  );
}
