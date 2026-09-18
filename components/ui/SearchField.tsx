"use client";

import { Search, XCircle } from "lucide-react";
import { cx } from "./cx";

/** Large rounded search input with a clear button (iOS search field). */
export default function SearchField({
  value,
  onChange,
  placeholder = "Search",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <label
      className={cx(
        "flex h-[52px] items-center gap-2.5 rounded-2xl bg-surface px-4 shadow-card ring-1 ring-hairline transition focus-within:ring-2 focus-within:ring-accent",
        className,
      )}
    >
      <Search className="h-[18px] w-[18px] shrink-0 text-ink-3" strokeWidth={2.2} />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="-mr-1 rounded-full p-1 text-ink-3 transition hover:text-ink-2"
        >
          <XCircle className="h-[18px] w-[18px]" fill="currentColor" stroke="rgb(var(--surface))" />
        </button>
      )}
    </label>
  );
}
