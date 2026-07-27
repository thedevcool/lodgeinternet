"use client";

import { MessageCircle, Zap, Sparkles, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { whatsappBotUrl } from "@/lib/whatsapp";

/**
 * Promotes the WhatsApp bot in Lodge Internet's premium Apple-inspired style.
 * Supported variants:
 *   - "top-banner": Stable, top notification bar anchored across the site.
 *   - "banner": Full-width showcase promo card (dashboard, landing, plans hero).
 *   - "payment-option": Dedicated card placed in checkout/payment flow next to Pay button.
 *   - "inline": Upgraded glowing button for inline CTA placement.
 *   - "floating-fab": Floating action pill locked to bottom-right corner.
 *   - "compact-card": Compact card ideal for sidebars/secondary containers.
 *
 * Renders nothing until a WhatsApp number/URL is configured (see lib/whatsapp).
 */
export default function WhatsAppBotCTA({
  variant = "inline",
  label = "Buy on the WhatsApp bot",
  prefill,
  className = "",
}: {
  variant?: "banner" | "inline" | "top-banner" | "payment-option" | "floating-fab" | "compact-card";
  label?: string;
  prefill?: string;
  className?: string;
}) {
  const url = whatsappBotUrl(prefill);
  if (!url) return null;

  // 1. STABLE TOP BANNER ACROSS SITE
  if (variant === "top-banner") {
    return (
      <div className={`relative z-40 bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 text-white py-2.5 px-4 shadow-sm border-b border-emerald-500/30 ${className}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2.5 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-300 animate-pulse shrink-0" />
            <span className="bg-white/20 text-white font-bold px-2 py-0.5 rounded-full text-[10px] sm:text-xs uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
              Fast Checkout
            </span>
            <span className="hidden md:inline font-medium text-emerald-50">
              Skip web forms — buy data or TV plans & get your access code instantly on WhatsApp!
            </span>
            <span className="md:hidden font-medium text-emerald-50">
              Buy data or TV directly on WhatsApp!
            </span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-white text-emerald-900 hover:bg-emerald-50 font-bold px-3.5 py-1.5 rounded-xl transition-all duration-200 shadow-sm hover:scale-105 active:scale-95 shrink-0 text-xs sm:text-sm"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>Chat & Buy Now</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
          </a>
        </div>
      </div>
    );
  }

  // 2. FULL SHOWCASE PROMO BANNER CARD
  if (variant === "banner") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group relative block rounded-3xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-green-50/40 to-teal-50/70 p-6 sm:p-8 shadow-lg hover:shadow-2xl hover:border-emerald-400 transition-all duration-300 transform hover:-translate-y-0.5 overflow-hidden ${className}`}
      >
        {/* Decorative background radial glow */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-400/35 transition-all duration-500" />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="relative flex items-center justify-center p-3.5 sm:p-4 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/25 shrink-0 group-hover:scale-105 transition-transform duration-300">
              <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white" strokeWidth={2.3} />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-300" />
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 border border-emerald-300/70 px-3 py-0.5 text-xs font-bold text-emerald-800 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  WhatsApp Bot • Active
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 border border-amber-300/70 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                  Instant Code
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-apple-gray-900 tracking-tight group-hover:text-emerald-950 transition-colors">
                Get Lodge Internet Faster on WhatsApp
              </h3>
              <p className="text-sm sm:text-base text-apple-gray-600 mt-1 max-w-xl leading-relaxed">
                Tap to chat, select your plan, pay securely, and receive your Wi-Fi connection code directly in chat — zero form-filling!
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-semibold text-emerald-800">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Instant Code Delivery
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> 10-Second Checkout
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Safe & Verified
                </span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-auto flex justify-end shrink-0">
            <span className="w-full lg:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 group-hover:from-emerald-600 group-hover:to-teal-700 text-white font-bold px-6 py-3.5 rounded-2xl transition-all duration-300 shadow-lg shadow-emerald-500/25 group-hover:shadow-xl group-hover:shadow-emerald-500/40 text-base">
              <MessageCircle className="w-5 h-5" />
              <span>Chat on WhatsApp</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </a>
    );
  }

  // 3. PAYMENT FLOW ALTERNATIVE OPTION CARD
  if (variant === "payment-option") {
    return (
      <div className={`mt-6 rounded-2xl border-2 border-emerald-400/90 bg-gradient-to-br from-emerald-50/90 via-green-50/60 to-emerald-100/40 p-5 shadow-md relative overflow-hidden group hover:border-emerald-500 transition-all ${className}`}>
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl text-white shrink-0 shadow-md shadow-emerald-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-700" />
                Fast Track Checkout
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h4 className="text-base font-bold text-apple-gray-900">
              Prefer WhatsApp Checkout?
            </h4>
            <p className="text-xs sm:text-sm text-apple-gray-600 mt-1 leading-relaxed">
              Skip typing email or web forms! Purchase this plan through our WhatsApp bot in under 10 seconds and receive your code directly in chat.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3.5 inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold py-3.5 px-5 rounded-xl transition-all shadow-md shadow-emerald-600/20 hover:shadow-lg transform active:scale-95 text-sm sm:text-base"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{label || "Buy This Plan on WhatsApp Bot"}</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 4. FLOATING BOTTOM-RIGHT FAB
  if (variant === "floating-fab") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`fixed bottom-5 right-5 z-50 group inline-flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 text-white font-bold px-4 py-3 rounded-full shadow-2xl shadow-emerald-600/40 border-2 border-white/40 backdrop-blur-md transform hover:scale-105 active:scale-95 transition-all duration-300 ${className}`}
        title="Buy on WhatsApp Bot"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
        <MessageCircle className="w-5 h-5 text-white" />
        <span className="text-xs sm:text-sm font-semibold pr-1">WhatsApp Bot</span>
      </a>
    );
  }

  // 5. COMPACT CARD VARIANT
  if (variant === "compact-card") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 hover:shadow-md transition-all ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-sm">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-800">Buy via WhatsApp</p>
            <p className="text-xs text-apple-gray-600">Get code instantly in chat</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />
      </a>
    );
  }

  // 6. DEFAULT INLINE BUTTON
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold px-6 py-3.5 rounded-2xl transition-all duration-300 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 active:scale-95 text-sm sm:text-base ${className}`}
    >
      <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
      <span>{label}</span>
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
    </a>
  );
}
