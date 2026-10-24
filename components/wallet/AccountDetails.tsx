"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import Button from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import type { Dva } from "./walletApi";

/** Small "Copy" button that flips to "Copied" for two seconds. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="tinted"
      size="sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * The customer's own bank account: number large (it's what they type into
 * their banking app), then bank and account name.
 * `panel` is the block's fill from the chosen wallet design (walletDesigns.ts);
 * the text colours follow the card's tokens.
 */
export function AccountDetails({ dva, panel = "bg-ink/[0.04]" }: { dva: Dva; panel?: string }) {
  return (
    <div className={cx("rounded-2xl px-4 py-3.5", panel)}>
      <p className="ui-footnote text-ink-2">Account number</p>
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <span className="select-all font-mono text-[24px] font-bold tabular-nums tracking-[0.06em] text-ink">
          {dva.account_number}
        </span>
        <CopyButton text={dva.account_number} />
      </div>
      <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3">
        <div className="flex justify-between gap-3">
          <dt className="ui-subhead text-ink-2">Bank</dt>
          <dd className="ui-subhead min-w-0 truncate text-right font-medium text-ink">{dva.bank_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="ui-subhead text-ink-2">Account name</dt>
          <dd className="ui-subhead min-w-0 truncate text-right font-medium text-ink">{dva.account_name}</dd>
        </div>
      </dl>
    </div>
  );
}
