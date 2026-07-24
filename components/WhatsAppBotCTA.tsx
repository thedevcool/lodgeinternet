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
        className={`group block rounded-3xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 hover:shadow-lg transition-all ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500 rounded-2xl shadow-md shrink-0">
              <MessageCircle className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-apple-gray-900">
                Want an even more seamless experience?
              </h3>
              <p className="text-sm text-apple-gray-600 mt-0.5">
                Try our new WhatsApp bot — buy data &amp; TV and get your code,
                all right in a chat.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 bg-green-500 group-hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors shadow-md shrink-0 whitespace-nowrap">
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
      className={`inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors shadow-sm ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      {label}
    </a>
  );
}
