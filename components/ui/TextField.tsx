"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "./cx";

/**
 * Labelled text input, 50px tall. Password fields get a show/hide toggle.
 * All native input props pass straight through (value, onChange, required…).
 */
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  labelAside?: ReactNode; // e.g. a "Forgot password?" link on the label row
};

const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, hint, error, labelAside, type = "text", className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={inputId} className="ui-footnote font-medium text-ink-2">
          {label}
        </label>
        {labelAside}
      </div>
      <div
        className={cx(
          "flex h-[50px] items-center rounded-inner bg-surface-2 px-4 ring-1 transition focus-within:ring-2",
          error ? "ring-danger/60 focus-within:ring-danger" : "ring-transparent focus-within:ring-accent",
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? "text" : type}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="-mr-1 rounded-full p-1.5 text-ink-3 transition hover:text-ink-2"
          >
            {reveal ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      {error ? (
        <p className="ui-footnote mt-1.5 px-1 text-danger">{error}</p>
      ) : hint ? (
        <div className="ui-footnote mt-1.5 px-1 text-ink-2">{hint}</div>
      ) : null}
    </div>
  );
});

export default TextField;
