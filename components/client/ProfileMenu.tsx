"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FileText, LogOut, Settings, Trash2, UserRound } from "lucide-react";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { cx } from "@/components/ui/cx";
import { signOut } from "@/lib/customerAuth";

/**
 * The signed-in customer's menu in the top bar: a round initial on phones,
 * an "Account" capsule on desktop. Opens a small card anchored top-right
 * with Account, Settings, Legal, Delete my account and Log out.
 *
 * Menu-button pattern: Escape, an outside click or tabbing away closes it;
 * focus moves to the first item on open and back to the button on Escape;
 * ↑/↓/Home/End move between items.
 */
const LINKS = [
  { href: "/dashboard", label: "Account", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/legal", label: "Legal", icon: FileText },
];

const ITEM =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[16px] outline-none transition-colors " +
  "hover:bg-ink/[0.05] focus-visible:bg-ink/[0.06]";

export default function ProfileMenu({ email }: { email: string }) {
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = (email[0] || "A").toUpperCase();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // While open: focus the first item; outside presses close it.
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  // Focus goes back to the button first, so the sheet hands it back there
  // when it closes (the menu item it came from is gone by then).
  const openDelete = () => {
    close(true);
    setDeleting(true);
  };

  const logOut = async () => {
    close(false);
    await signOut();
    router.push("/");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Your account menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          "flex h-9 select-none items-center justify-center rounded-full font-semibold transition-[transform,background-color] duration-200 ease-ios active:scale-[0.97]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          // Phone: the round initial. Desktop: the gray "Account" capsule.
          "w-9 bg-accent/10 text-[15px] text-accent-ink",
          "md:w-auto md:bg-ink/[0.06] md:px-4 md:tracking-[-0.01em] md:text-ink md:hover:bg-ink/10",
        )}
      >
        <span className="md:hidden">{initial}</span>
        <span className="hidden md:inline">Account</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="ui-glass animate-pop-in absolute right-0 top-full z-40 mt-2 w-[min(17rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-card py-1.5 shadow-float"
        >
          <div className="border-b border-hairline px-4 pb-2.5 pt-1.5">
            <p className="ui-footnote text-ink-2">Signed in as</p>
            <p className="ui-subhead truncate font-medium text-ink">{email}</p>
          </div>
          <div className="py-1">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" tabIndex={-1} onClick={() => close(false)} className={cx(ITEM, "text-ink")}>
                <Icon className="h-[18px] w-[18px] text-ink-2" />
                {label}
              </Link>
            ))}
          </div>
          <div className="border-t border-hairline py-1">
            <button type="button" role="menuitem" tabIndex={-1} onClick={openDelete} className={cx(ITEM, "text-danger")}>
              <Trash2 className="h-[18px] w-[18px]" />
              Delete my account
            </button>
            <button type="button" role="menuitem" tabIndex={-1} onClick={logOut} className={cx(ITEM, "text-ink")}>
              <LogOut className="h-[18px] w-[18px] text-ink-2" />
              Log out
            </button>
          </div>
        </div>
      )}

      <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />
    </div>
  );
}
