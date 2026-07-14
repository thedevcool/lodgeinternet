"use client";
import { apiFetch } from "@/lib/apiClient";

import { useState } from "react";
import { Tv, AlertTriangle } from "lucide-react";

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in slide-in-from-bottom-4 duration-200">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl mb-4">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-semibold text-apple-gray-900 mb-2">
            Update TV MAC Address
          </h3>
          <p className="text-apple-gray-600 text-sm">
            {planName}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            Submitting a new MAC will notify the admin to re-provision your TV on the network. There may be a short delay before the change takes effect.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="mac-address"
              className="block text-sm font-semibold text-apple-gray-900 mb-2"
            >
              TV MAC Address
            </label>
            <input
              id="mac-address"
              type="text"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              required
              autoFocus
              placeholder="00:1A:2B:3C:4D:5E"
              className="w-full px-4 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-apple-gray-900 placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
            />
            <p className="text-xs text-apple-gray-500 mt-2">
              Find this in your TV's network settings. Accepts colons, hyphens, or no separator.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-400 via-blue-500 to-purple-400 text-white font-semibold py-4 rounded-2xl hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Updating...
              </span>
            ) : (
              "Update MAC Address"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
