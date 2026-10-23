import { ArrowUpRight } from "lucide-react";
import { telegramBotUrl } from "@/lib/telegram";
import { whatsappBotUrl } from "@/lib/whatsapp";
import TelegramIcon from "./TelegramIcon";
import WhatsAppIcon from "./WhatsAppIcon";
import { cx } from "./cx";

/**
 * The designed WhatsApp card (Figma: "Get Lodge Internet faster on WhatsApp",
 * "Prefer WhatsApp?", "Quick Help"). Renders nothing until a WhatsApp number
 * is configured — same rule as WhatsAppBotCTA.
 *
 * When the Telegram bot is configured too (lib/telegram), the card offers it
 * alongside: the same bot, where balance checks are unlimited. WhatsApp stays
 * the main button — Telegram is introduced, not pushed.
 */
export default function WhatsAppCard({
  title = "Prefer WhatsApp?",
  message = "Pick a plan, pay securely and get your access code right in the chat.",
  cta = "Chat on WhatsApp",
  prefill = "Hi Lodge Internet",
  telegramSource = "site",
  compact,
  className,
}: {
  title?: string;
  message?: string;
  cta?: string;
  prefill?: string;
  /** Where on the site this card is, carried in the Telegram link (see lib/telegram). */
  telegramSource?: string;
  compact?: boolean;
  className?: string;
}) {
  const url = whatsappBotUrl(prefill);
  if (!url) return null;
  const tg = telegramBotUrl(telegramSource);
  // "Prefer WhatsApp?" over two buttons reads as if Telegram were an aside.
  const heading = tg ? title.replace(/\bWhatsApp\b/g, "WhatsApp or Telegram") : title;

  return (
    <div
      className={cx(
        // With Telegram offered too, the card goes neutral so neither brand
        // owns it; each brand keeps its colour on its own button, and a soft
        // green-to-blue wash ties the two together. WhatsApp alone keeps its
        // original green card.
        "relative overflow-hidden rounded-card",
        tg ? "bg-surface ring-1 ring-hairline shadow-card" : "bg-wa/[0.08] ring-1 ring-wa/15",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      {tg ? (
        <>
          <div aria-hidden className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-wa/[0.14] blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-14 -right-10 h-44 w-44 rounded-full bg-tg/[0.16] blur-3xl" />
        </>
      ) : (
        /* soft glow in the corner, echoing the Figma card */
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-wa/15 blur-2xl" />
      )}
      <div className="relative flex items-start gap-3.5">
        {tg ? (
          <span className="relative h-11 w-14 shrink-0" aria-hidden>
            <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-[11px] bg-wa text-white shadow-sm">
              <WhatsAppIcon className="h-5 w-5" />
            </span>
            <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-[11px] bg-tg text-white shadow-sm ring-2 ring-surface">
              <TelegramIcon className="h-5 w-5" />
            </span>
          </span>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-wa text-white">
            <WhatsAppIcon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="ui-headline text-ink">{heading}</p>
          <p className="ui-subhead mt-1 text-ink-2">{message}</p>
        </div>
      </div>
      <div className="relative mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-wa px-5 text-[16px] font-semibold text-white transition active:scale-[0.97] hover:bg-wa/90 sm:w-auto"
        >
          <WhatsAppIcon className="h-5 w-5" />
          {cta}
          <ArrowUpRight className="h-4 w-4" />
        </a>
        {tg && (
          <a
            href={tg}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-tg px-5 text-[16px] font-semibold text-white transition active:scale-[0.97] hover:bg-tg/90 sm:w-auto"
          >
            <TelegramIcon className="h-5 w-5" />
            Use Telegram
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
      {tg && <p className="ui-footnote relative mt-2.5 text-ink-2">On Telegram, balance checks are unlimited.</p>}
    </div>
  );
}
