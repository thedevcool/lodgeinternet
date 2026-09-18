"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx } from "@/components/ui/cx";

/**
 * Appearance: Light · Dark · System.
 * The choice is stored in localStorage["lodge:theme"] and applied as
 * <html data-theme="light|dark"> (no attribute = follow the system).
 * globals.css reads that attribute; THEME_INIT_SCRIPT (in the client layout)
 * applies it before first paint so there's no flash.
 */
export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "lodge:theme";
const CHANGE_EVENT = "lodge:theme-change";

export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setPref(saved);
    } catch {
      // storage blocked — stay on "system"
    }
    // Keep every toggle on the page (nav + footer) in sync.
    const onChange = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const choose = (next: ThemePref) => {
    applyTheme(next);
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked — the choice still applies for this visit
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  };

  return [pref, choose];
}

const OPTIONS: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Three-way pill with a sliding thumb. `withLabels` shows the words too. */
export default function ThemeToggle({ withLabels, className }: { withLabels?: boolean; className?: string }) {
  const [pref, choose] = useThemePref();
  const index = OPTIONS.findIndex((o) => o.value === pref);

  return (
    <div role="radiogroup" aria-label="Appearance" className={cx("relative inline-flex rounded-full bg-ink/[0.06] p-1", className)}>
      {/* sliding thumb */}
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-surface shadow-[0_2px_8px_rgb(0_0_0/0.14)] transition-transform duration-500 ease-spring"
        style={{ width: `calc((100% - 8px) / ${OPTIONS.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cx(
            "relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors",
            withLabels ? "px-3" : "w-9",
            pref === value ? "text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          <Icon className="h-4 w-4" />
          {withLabels && label}
        </button>
      ))}
    </div>
  );
}
