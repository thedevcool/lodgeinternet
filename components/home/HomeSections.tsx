"use client";

import { useRef, useState, type ReactNode } from "react";
import { Headset, Layers, Signal, Wifi } from "lucide-react";
import Reveal from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/** Marketing sections of the home page — copy is the Figma copy, verbatim. */

// ── How it works ───────────────────────────────────────────────────────────
const STEPS = [
  { icon: Wifi, title: "Choose your hostel", text: "See plans available for your exact location." },
  { icon: Layers, title: "Select a plan", text: "Pick the data size and duration that works for you." },
  { icon: Signal, title: "Get connected", text: "Your access details arrive immediately after payment." },
];

/** Mobile: swipeable cards with page dots. Desktop: three cards in a row. */
export function HowItWorks() {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / (el.scrollWidth / STEPS.length)));
  };

  return (
    <Reveal>
      <SectionTitle eyebrow="How it works" title="Online in three simple steps." />
      <div
        ref={scroller}
        onScroll={onScroll}
        className="ui-scroll-x -mx-4 flex gap-3 px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0"
      >
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="w-[82%] shrink-0 snap-center rounded-card bg-surface p-6 shadow-card sm:w-[60%] md:w-auto"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
              <s.icon className="h-6 w-6" />
            </span>
            <p className="ui-eyebrow mt-5 text-accent-ink">Step {String(i + 1).padStart(2, "0")}</p>
            <p className="ui-title-3 mt-1 text-ink">{s.title}</p>
            <p className="ui-subhead mt-1.5 text-ink-2">{s.text}</p>
          </div>
        ))}
      </div>
      {/* page dots (mobile) */}
      <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={cx("h-1.5 rounded-full transition-all duration-300", i === active ? "w-5 bg-ink-2" : "w-1.5 bg-ink/20")}
          />
        ))}
      </div>
    </Reveal>
  );
}

// ── About band ─────────────────────────────────────────────────────────────
export function AboutBand() {
  return (
    <Reveal>
      <div className="relative overflow-hidden rounded-[32px] bg-accent px-6 py-10 text-white sm:px-10 md:py-14">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="ui-eyebrow text-white/75">About Lodge Internet</p>
            <p className="ui-title-1 mt-2">Fast internet should feel effortless</p>
            <p className="ui-body mt-3 text-white/85">
              Managed, high-speed internet built for hostels — no complicated setups, no hidden fees.
            </p>
          </div>
          <div className="rounded-card bg-surface p-6 text-ink shadow-float">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent-ink">
                <Headset className="h-5 w-5" />
              </span>
              <p className="ui-headline">24/7 Reliable connection support</p>
            </div>
            <p className="ui-subhead mt-3 text-ink-2">
              Questions or a code that won&apos;t work? We&apos;re a message away.
            </p>
            <ButtonLink href="/support" full size="md" className="mt-5">
              Contact Support
            </ButtonLink>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// ── Shared section heading ─────────────────────────────────────────────────
export function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 md:mb-8">
      <p className="ui-eyebrow text-accent-ink">{eyebrow}</p>
      <h2 className="ui-title-1 mt-1.5 text-ink md:text-[40px] md:leading-[46px] md:tracking-[-0.025em]">{title}</h2>
      {children && <div className="ui-body mt-2 text-ink-2">{children}</div>}
    </div>
  );
}
