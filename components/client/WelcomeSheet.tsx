"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Landmark, MessagesSquare, Wallet } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import { BrandGlyph } from "@/components/ui/BrandMark";
import { useCustomer } from "@/components/client/CustomerProvider";
import { WALLET_SETUP_EVENT } from "@/components/wallet/walletApi";

/**
 * One-time "What's New" sheet. It first introduced the redesign (v1); it now
 * introduces the wallet and the customer's own account number (v2), so every
 * signed-in customer sees it once more.
 *
 * Signed-in customers only — the button takes them to their dashboard, where
 * the wallet card and the phone prompt glow (`?setup=wallet`, read by
 * WalletSection). Shown once per device (localStorage), ~600ms after first
 * paint, and never on checkout, auth, maintenance or waitlist pages — it must
 * not interrupt a payment or a return from Paystack.
 */
const STORAGE_KEY = "lodge:welcome-seen:v2-wallet";
const SKIP_ON = [
  /\/plans$/,
  /^\/login/,
  /^\/register/,
  /^\/forgot-password/,
  /^\/maintenance/,
  /^\/waitlist/,
];

// If storage is blocked (private mode), still show it at most once per page load.
let shownThisLoad = false;

export default function WelcomeSheet() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { user, ready } = useCustomer();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !user || shownThisLoad || SKIP_ON.some((rule) => rule.test(pathname))) return;
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
  }, [pathname, ready, user]);

  const markSeen = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — shownThisLoad already prevents a repeat on this load
    }
    setOpen(false);
  };

  const setUp = () => {
    markSeen();
    // Already on the dashboard: nothing remounts, so ask the wallet to glow.
    // Closing the sheet steps back through the history entry it added, so
    // navigate once that has happened, or the step back cancels it.
    window.setTimeout(() => {
      if (pathname.startsWith("/dashboard")) window.dispatchEvent(new Event(WALLET_SETUP_EVENT));
      else router.push("/dashboard?setup=wallet");
    }, 350);
  };

  return (
    <Sheet open={open} onClose={markSeen} history showClose={false} ariaLabel="Meet your Lodge Wallet">
      <div className="px-1 pb-2 pt-4 text-center md:pt-6">
        <BrandGlyph className="mx-auto h-16 w-16 animate-check-pop" />
        <h2 className="ui-title-1 mx-auto mt-5 max-w-[18ch] text-ink">Paying just got easier</h2>
        <p className="ui-subhead mx-auto mt-2 max-w-[34ch] text-ink-2">
          We keep making Lodge Internet simpler for you. Meet your wallet and your very own account number.
        </p>
      </div>

      <ul className="mt-6 space-y-5 px-1">
        <Feature
          icon={<Wallet className="h-5 w-5" />}
          tile="bg-accent"
          title="Your Lodge Wallet"
          text="Top it up once, then buy any plan in a single tap. Your code is ready instantly."
        />
        <Feature
          icon={<Landmark className="h-5 w-5" />}
          tile="bg-indigo-500"
          title="An account number that's all yours"
          text="Same details every time. Save it once and send money whenever you like. No more checking which account to pay into."
        />
        <Feature
          icon={<MessagesSquare className="h-5 w-5" />}
          tile="bg-wa"
          title="One wallet, everywhere"
          text="The same wallet and account number work here and on our WhatsApp and Telegram bots. Top up once, buy wherever you are."
        />
      </ul>

      <Button full className="mt-8" onClick={setUp}>
        Set up my wallet
      </Button>
      <Button variant="plain" full className="mt-1" onClick={markSeen}>
        Maybe later
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
