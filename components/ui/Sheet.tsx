"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";

/**
 * Sheet — iOS bottom sheet on mobile, centred card on desktop.
 * variant="alert" is a small centred alert on every screen size.
 *
 * Rules that keep it safe next to the Paystack popup (see the redesign plan):
 *   - Scroll lock is a ref-counted class on <html>; we never touch body.style
 *     (Paystack resets body.style.overflow when its popup closes).
 *   - Focus moves into the sheet only when it opens; Tab is trapped by a
 *     keydown listener on the panel itself, so focus inside Paystack's iframe
 *     is never pulled back. We never set `inert`/`aria-hidden` on <body>.
 *   - `dismissible={false}` blocks Escape, backdrop taps and the back button.
 *   - `history` adds a same-URL history entry so Android "back" closes the
 *     sheet instead of leaving the page.
 */

// ── Scroll lock ────────────────────────────────────────────────────────────
let lockCount = 0;
function lockScroll() {
  if (lockCount++ === 0) document.documentElement.classList.add("ui-scroll-locked");
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.classList.remove("ui-scroll-locked");
}

// ── Open-sheet stack: only the top sheet reacts to Escape / back ───────────
const openStack: string[] = [];
const isTop = (id: string) => openStack[openStack.length - 1] === id;

const LAYERS = {
  sheet: "z-[60]",
  "sheet-over": "z-[65]", // a sheet opened on top of another (e.g. MAC over checkout)
  alert: "z-[70]",
} as const;

const EXIT_MS = 260;

type SheetProps = {
  open: boolean;
  onClose?: () => void;
  /** Defaults to true when onClose is given. */
  dismissible?: boolean;
  layer?: keyof typeof LAYERS;
  variant?: "sheet" | "alert";
  /** Visible title in the sheet header (also used as the accessible name). */
  title?: string;
  ariaLabel?: string;
  /** Android back button closes the sheet. Only for plain dismissals. */
  history?: boolean;
  /** Show the round X button in the header. */
  showClose?: boolean;
  /** Pinned below the scrolling body — e.g. a Pay button. */
  footer?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
};

export default function Sheet({
  open,
  onClose,
  dismissible,
  layer = "sheet",
  variant = "sheet",
  title,
  ariaLabel,
  history = false,
  showClose = true,
  footer,
  size = "md",
  children,
}: SheetProps) {
  const id = useId();
  const canDismiss = (dismissible ?? Boolean(onClose)) && Boolean(onClose);

  // Keep the latest callbacks in refs so listeners never call a stale one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canDismissRef = useRef(canDismiss);
  canDismissRef.current = canDismiss;

  // Mount → play enter animation; close → play exit animation, then unmount.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  // Render into #client-portal (inside .client-root) so tokens and font apply.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalEl(document.getElementById("client-portal") ?? document.body);
  }, []);

  // While open: scroll lock, stack membership, focus in / focus restore.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    lockScroll();
    openStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the panel itself (not an input) so mobile keyboards don't pop up.
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(raf);
      unlockScroll();
      const i = openStack.lastIndexOf(id);
      if (i >= 0) openStack.splice(i, 1);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, id]);

  // Escape closes the top-most dismissible sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && isTop(id) && canDismissRef.current) {
        e.preventDefault();
        onCloseRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, id]);

  // Android back button: push a same-URL entry; popping it closes the sheet.
  useEffect(() => {
    if (!open || !history) return;
    window.history.pushState({ __sheet: id }, "");
    let poppedByBack = false;

    const onPop = () => {
      if (!isTop(id)) return;
      if (canDismissRef.current) {
        poppedByBack = true;
        onCloseRef.current?.();
      } else {
        // Not dismissible right now (e.g. payment in progress): stay put.
        window.history.pushState({ __sheet: id }, "");
      }
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by a button: remove our entry — but only if it is still the
      // current one (if the page navigated away, leave history alone).
      if (!poppedByBack && window.history.state?.__sheet === id) window.history.back();
    };
  }, [open, history, id]);

  // Tab stays inside the panel.
  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted || !portalEl) return null;

  const isAlert = variant === "alert";
  const panelAnim = closing
    ? isAlert
      ? "animate-pop-out"
      : "animate-sheet-down md:animate-pop-out"
    : isAlert
      ? "animate-pop-in"
      : "animate-sheet-up md:animate-pop-in";

  return createPortal(
    <div className={cx("fixed inset-0", LAYERS[layer])}>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={() => canDismiss && onCloseRef.current?.()}
        className={cx("absolute inset-0 bg-[var(--backdrop)]", closing ? "animate-fade-out" : "animate-fade-in")}
      />

      {/* Positioner: bottom on mobile, centre on desktop (alerts always centre) */}
      <div
        className={cx(
          "pointer-events-none absolute inset-0 flex justify-center",
          isAlert ? "items-center p-6" : "items-end md:items-center md:p-6",
        )}
      >
        <div
          ref={panelRef}
          role={isAlert ? "alertdialog" : "dialog"}
          aria-modal="true"
          aria-label={ariaLabel ?? title}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          className={cx(
            "ui-glass pointer-events-auto relative flex w-full flex-col overflow-hidden outline-none",
            isAlert
              ? "max-w-[340px] rounded-sheet"
              : cx(
                  "max-h-[92dvh] rounded-t-sheet pb-[env(safe-area-inset-bottom)] md:max-h-[86vh] md:rounded-sheet md:pb-0",
                  size === "lg" ? "md:max-w-[640px]" : "md:max-w-[520px]",
                ),
            panelAnim,
          )}
        >
          {!isAlert && (
            <div className="relative shrink-0 px-5 pb-1 pt-2.5">
              {/* grabber (decorative, mobile) */}
              <div aria-hidden className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-ink/20 md:hidden" />
              {(title || (showClose && canDismiss)) && (
                <div className="flex min-h-[36px] items-center justify-between gap-3 pt-1">
                  <h2 className="ui-title-3 text-ink">{title}</h2>
                  {showClose && canDismiss && (
                    <button
                      type="button"
                      onClick={() => onCloseRef.current?.()}
                      aria-label="Close"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.08] text-ink-2 transition hover:bg-ink/[0.12]"
                    >
                      <X className="h-4 w-4" strokeWidth={2.6} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain", isAlert ? "p-6" : "px-5 pb-5 pt-2")}>
            {children}
          </div>

          {footer && <div className="shrink-0 border-t border-hairline px-5 pb-5 pt-4">{footer}</div>}
        </div>
      </div>
    </div>,
    portalEl,
  );
}
