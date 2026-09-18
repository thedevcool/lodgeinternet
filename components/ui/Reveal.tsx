"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * Fades a section up as it scrolls into view — desktop only (phones get the
 * content immediately; motion there is saved for touch feedback). Content
 * already on screen when the page loads is never hidden.
 */
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "waiting" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const belowFold = el.getBoundingClientRect().top > window.innerHeight;
    if (!desktop || reduced || !belowFold) return;

    setState("waiting");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cx(state === "waiting" && "opacity-0", state === "shown" && "animate-fade-up", className)}>
      {children}
    </div>
  );
}
