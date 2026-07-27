"use client";

import { MessageCircle } from "lucide-react";
import { whatsappBotUrl } from "@/lib/whatsapp";

/**
 * Promotes the WhatsApp bot, in the site's style. Two variants:
 *   - "banner": full-width card (users page / dashboard).
 *   - "inline": compact button ("Buy on the WhatsApp bot") next to buy actions.
 *
 * Renders nothing until a WhatsApp number/URL is configured (see lib/whatsapp).
 */
export default function WhatsAppBotCTA({
  variant = "inline",
  label = "Buy on the WhatsApp bot",
  prefill,
  className = "",
}: {
  variant?: "banner" | "inline";
  label?: string;
  prefill?: string;
  className?: string;
}) {
  const url = whatsappBotUrl(prefill);
  if (!url) return null;

  if (variant === "banner") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group block rounded-3xl border border-green-200 bg-gradient-to-r from-green-50 via-emerald-50 to-white hover:shadow-lg transition-all ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center p-3 bg-green-500 rounded-2xl shadow-md shrink-0">
              <MessageCircle className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 mb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                New WhatsApp checkout
              </div>
              <h3 className="text-lg font-semibold text-apple-gray-900">
                Get Lodge Internet faster on WhatsApp.
              </h3>
              <p className="text-sm text-apple-gray-600 mt-1 max-w-xl">
                Tap to chat, buy data or TV, and receive your connection code instantly — no extra form-filling.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 bg-green-500 group-hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-xl transition-all shadow-lg shrink-0 whitespace-nowrap transform group-hover:-translate-y-0.5">
            <MessageCircle className="w-4 h-4" />
            Chat on WhatsApp
          </span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      {label}
    </a>
  );
}
