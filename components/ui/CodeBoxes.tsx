"use client";

import { useState } from "react";
import { cx } from "./cx";

/**
 * Six boxes for the 6-digit email code. One real input sits on top (so
 * paste, autofill "one-time-code" and the number keyboard all work); the
 * boxes just display what's typed.
 */
export default function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="relative block">
      <span className="sr-only">Verification Code</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        autoFocus
        className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
      <span className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={cx(
              "flex h-14 items-center justify-center rounded-inner bg-surface-2 font-mono text-[26px] font-bold text-ink transition",
              focused && i === Math.min(value.length, 5) ? "ring-2 ring-accent" : "ring-1 ring-transparent",
            )}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </span>
    </label>
  );
}
