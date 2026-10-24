"use client";

import { useEffect, useState } from "react";

/**
 * Wallet card designs the customer picks in Settings. The choice lives in
 * localStorage["lodge:wallet-design"] (per browser, "classic" by default) and
 * a "lodge:wallet-design-change" event keeps every open wallet card in sync.
 *
 * Coloured designs re-point the colour tokens *inside the card* (ON_COLOUR):
 * text-ink becomes white, tinted buttons become white glass, inputs go dark.
 * So everything rendered in the card — balance, account details, alerts, the
 * card top-up form — stays readable without each piece knowing the design.
 * Full literal class strings only: Tailwind drops anything built at runtime.
 */
export type WalletDesignId = "classic" | "midnight" | "ocean" | "emerald" | "sunset" | "mono";

export type WalletDesign = {
  id: WalletDesignId;
  name: string;
  /** Background (and token overrides) for the balance card. */
  card: string;
  /** The account-details block inside the card. */
  panel: string;
};

// Light tints, not translucent white: the tokens are RGB channels, and these
// keep secondary text above 4.5:1 on every gradient below.
const ON_COLOUR =
  "bg-gradient-to-br text-white [--ink:255_255_255] [--ink-2:226_232_240] [--ink-3:203_213_225] " +
  "[--hairline:rgb(255_255_255/0.2)] [--accent:255_255_255] [--accent-ink:255_255_255] " +
  "[--surface-2:15_23_42] [--danger:254_202_202] [--warning:253_230_138] [--success:187_247_208]";

export const WALLET_DESIGNS: WalletDesign[] = [
  { id: "classic", name: "Classic", card: "bg-surface", panel: "bg-ink/[0.04]" },
  {
    id: "midnight",
    name: "Midnight",
    card: `${ON_COLOUR} from-slate-900 via-indigo-950 to-slate-950`,
    panel: "bg-white/[0.08]",
  },
  { id: "ocean", name: "Ocean", card: `${ON_COLOUR} from-sky-700 via-blue-700 to-indigo-800`, panel: "bg-black/15" },
  {
    id: "emerald",
    name: "Emerald",
    card: `${ON_COLOUR} from-emerald-700 via-teal-700 to-teal-900`,
    panel: "bg-black/15",
  },
  {
    id: "sunset",
    name: "Sunset",
    card: `${ON_COLOUR} from-orange-700 via-rose-700 to-fuchsia-900`,
    panel: "bg-black/15",
  },
  { id: "mono", name: "Mono", card: `${ON_COLOUR} from-zinc-700 via-zinc-800 to-zinc-950`, panel: "bg-white/[0.08]" },
];

const STORAGE_KEY = "lodge:wallet-design";
const CHANGE_EVENT = "lodge:wallet-design-change";

function designFor(id: string | null | undefined): WalletDesign {
  return WALLET_DESIGNS.find((d) => d.id === id) ?? WALLET_DESIGNS[0];
}

/** The chosen design, and a setter that saves it and tells the other cards. */
export function useWalletDesign(): [WalletDesign, (id: WalletDesignId) => void] {
  // Start on Classic and read storage after mount, so the server render and
  // the first client render match.
  const [design, setDesign] = useState<WalletDesign>(WALLET_DESIGNS[0]);

  useEffect(() => {
    try {
      setDesign(designFor(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // storage blocked — stay on Classic
    }
    const onChange = (e: Event) => setDesign(designFor((e as CustomEvent<string>).detail));
    // Another tab changed it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDesign(designFor(e.newValue));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const choose = (id: WalletDesignId) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage blocked — the choice still applies for this visit
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
  };

  return [design, choose];
}
