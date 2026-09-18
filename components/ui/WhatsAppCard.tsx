import { ArrowUpRight } from "lucide-react";
import { whatsappBotUrl } from "@/lib/whatsapp";
import WhatsAppIcon from "./WhatsAppIcon";
import { cx } from "./cx";

/**
 * The designed WhatsApp card (Figma: "Get Lodge Internet faster on WhatsApp",
 * "Prefer WhatsApp?", "Quick Help"). Renders nothing until a WhatsApp number
 * is configured — same rule as WhatsAppBotCTA.
 */
export default function WhatsAppCard({
  title = "Prefer WhatsApp?",
  message = "Pick a plan, pay securely and get your access code right in the chat.",
  cta = "Chat on WhatsApp",
  prefill = "Hi Lodge Internet",
  compact,
  className,
}: {
  title?: string;
  message?: string;
  cta?: string;
  prefill?: string;
  compact?: boolean;
  className?: string;
}) {
  const url = whatsappBotUrl(prefill);
  if (!url) return null;

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-card bg-wa/[0.08] ring-1 ring-wa/15",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      {/* soft glow in the corner, echoing the Figma card */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-wa/15 blur-2xl" />
      <div className="relative flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-wa text-white">
          <WhatsAppIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="ui-headline text-ink">{title}</p>
          <p className="ui-subhead mt-1 text-ink-2">{message}</p>
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-wa px-5 text-[16px] font-semibold text-white transition active:scale-[0.97] hover:bg-wa/90 sm:w-auto"
      >
        {cta}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
