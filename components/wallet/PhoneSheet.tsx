"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import { looksLikePhone, savePhone } from "./walletApi";

/**
 * "Add your phone number" — the bank needs one to open the customer's own
 * account. Saves via PATCH /api/account/phone, then calls onSaved so the
 * caller can retry whatever asked for it (a checkout, or getting the account).
 */
export default function PhoneSheet({
  open,
  onClose,
  onSaved,
  message = "Your bank needs it to open your own account number for transfers.",
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (phone: string) => void;
  message?: string;
}) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fresh each time it opens.
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const submit = async () => {
    if (!looksLikePhone(phone)) {
      setError("Enter a Nigerian mobile number, e.g. 0803 123 4567.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await savePhone(phone);
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || "Couldn't save your phone number.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={saving ? undefined : onClose} layer="sheet-over" ariaLabel="Add your phone number">
      <div className="pt-1 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white">
          <Smartphone className="h-7 w-7" />
        </span>
        <h2 className="ui-title-2 mt-4 text-ink">Add your phone number</h2>
        <p className="ui-subhead mx-auto mt-1.5 max-w-xs text-ink-2">{message}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-5"
      >
        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 123 4567"
          error={error || null}
          required
        />
        <Button type="submit" full loading={saving}>
          {saving ? "Saving..." : "Save and continue"}
        </Button>
      </form>
    </Sheet>
  );
}
