"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { Tv } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import InlineAlert from "@/components/ui/InlineAlert";

interface UpdateMacModalProps {
  subscriptionId: string;
  planName: string;
  /** Called with the user's fresh ID token; modal sends the request itself */
  getIdToken: () => Promise<string>;
  /** Show a re-auth modal so the user can refresh their session, then retry */
  onSessionExpired: (retry: (freshToken: string) => Promise<void>) => void;
  onSuccess: () => void;
  onCancel: () => void;
}

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;

export default function UpdateMacModal({
  subscriptionId,
  planName,
  getIdToken,
  onSessionExpired,
  onSuccess,
  onCancel,
}: UpdateMacModalProps) {
  const [macAddress, setMacAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (overrideToken?: string) => {
    const trimmed = macAddress.trim();
    if (!trimmed) {
      setError("Please enter your TV MAC address");
      return;
    }
    if (!MAC_REGEX.test(trimmed)) {
      setError("Please enter a valid MAC address (e.g., 00:1A:2B:3C:4D:5E)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const idToken = overrideToken || (await getIdToken());

      const res = await apiFetch("/api/tv/update-mac", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ subscriptionId, macAddress: trimmed }),
      });

      const result = await res.json();

      if (result.code === "SESSION_EXPIRED") {
        onSessionExpired(async (freshToken: string) => {
          await submit(freshToken);
        });
        return;
      }

      if (!res.ok) {
        throw new Error(result.error || "Failed to update MAC address");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update MAC address");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open onClose={onCancel} ariaLabel="Update TV MAC address">
      <div className="pt-1 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] bg-accent text-white">
          <Tv className="h-7 w-7" />
        </span>
        <h2 className="ui-title-2 mt-4 text-ink">Update TV MAC Address</h2>
        <p className="ui-subhead mt-1 text-ink-2">{planName}</p>
      </div>

      <div className="mt-6 space-y-5">
        {error && <InlineAlert>{error}</InlineAlert>}
        <InlineAlert tone="warning">
          Submitting a new MAC will notify the admin to re-provision your TV on the network. There may be a short delay
          before the change takes effect.
        </InlineAlert>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-5"
        >
          <TextField
            label="TV MAC Address"
            value={macAddress}
            onChange={(e) => setMacAddress(e.target.value)}
            required
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="00:1A:2B:3C:4D:5E"
            className="[&_input]:font-mono"
            hint="Find this in your TV’s network settings. Accepts colons, hyphens, or no separator."
          />
          <Button type="submit" full loading={loading}>
            {loading ? "Updating..." : "Update MAC Address"}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
