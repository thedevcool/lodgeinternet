"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "./cx";

/**
 * Labelled text input, 50px tall. Password fields get a show/hide toggle.
 * All native input props pass straight through (value, onChange, required…).
 *
 * The line under the input (the error, or else the hint) is tied to the
 * input with aria-describedby, so a screen reader reads the reason along
 * with the field. It used to say "invalid" and nothing more. The line sits
 * in a polite live region that is always on the page, so an error that
 * appears while the customer is typing is read out too, without cutting off
 * what the reader was saying (role="alert" would).
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
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || hint);
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
          aria-describedby={hasMessage ? messageId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
          {...rest}
        />
        {isPassword && (
          // 44 px to tap (standard F5) with the eye centred; it was 32 px.
          // The negative margin leaves the eye where it was in the field.
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:text-ink-2"
          >
            {reveal ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {error ? (
          <p id={messageId} className="ui-footnote mt-1.5 px-1 text-danger-ink">
            {error}
          </p>
        ) : hint ? (
          <div id={messageId} className="ui-footnote mt-1.5 px-1 text-ink-2">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default TextField;
