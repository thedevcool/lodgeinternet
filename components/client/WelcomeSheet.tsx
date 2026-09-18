"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Search, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { BrandGlyph } from "@/components/ui/BrandMark";
import WhatsAppIcon from "@/components/ui/WhatsAppIcon";

/**
 * One-time "What's New" sheet introducing the redesign.
 * Shown once per device (localStorage), ~600ms after first paint, and never
 * on checkout, auth, maintenance or waitlist pages — it must not interrupt a
 * payment or a return from Paystack.
 */
const STORAGE_KEY = "lodge:welcome-seen:v1";
const SKIP_ON = [/\/plans$/, /^\/login/, /^\/register/, /^\/forgot-password/, /^\/maintenance/, /^\/waitlist/];

// If storage is blocked (private mode), still show it at most once per page load.
let shownThisLoad = false;

export default function WelcomeSheet() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shownThisLoad || SKIP_ON.some((rule) => rule.test(pathname))) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // storage unavailable — fall back to once per page load
    }
    if (seen) return;
    const timer = window.setTimeout(() => {
      shownThisLoad = true;
      setOpen(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — shownThisLoad already prevents a repeat on this load
    }
    setOpen(false);
  };

  return (
    <Sheet open={open} onClose={dismiss} history showClose={false} ariaLabel="Welcome to the new Lodge Internet">
      <div className="px-1 pb-2 pt-4 text-center md:pt-6">
        <BrandGlyph className="mx-auto h-16 w-16 animate-check-pop" />
        <h2 className="ui-title-1 mx-auto mt-5 max-w-[16ch] text-ink">Welcome to the new Lodge Internet</h2>
      </div>

      <ul className="mt-6 space-y-5 px-1">
        <Feature
          icon={<Sparkles className="h-5 w-5" />}
          tile="bg-accent"
          title="A fresh new look"
          text="Cleaner, calmer and faster on any phone — in light or dark mode."
        />
        <Feature
          icon={<Search className="h-5 w-5" />}
          tile="bg-indigo-500"
          title="Find your hostel in seconds"
          text="Search every location and hostel from one place."
        />
        <Feature
          icon={<WhatsAppIcon className="h-5 w-5" />}
          tile="bg-wa"
          title="Prefer WhatsApp?"
          text="Same plans, same instant codes — right in the chat."
        />
      </ul>

      <Button full className="mt-8" onClick={dismiss}>
        Continue
      </Button>
    </Sheet>
  );
}

function Feature({ icon, tile, title, text }: { icon: ReactNode; tile: string; title: string; text: string }) {
  return (
    <li className="flex items-start gap-4 text-left">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] text-white ${tile}`}>{icon}</span>
      <div>
        <p className="ui-headline text-ink">{title}</p>
        <p className="ui-subhead mt-0.5 text-ink-2">{text}</p>
      </div>
    </li>
  );
}
