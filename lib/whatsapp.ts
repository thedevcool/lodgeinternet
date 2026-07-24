/**
 * WhatsApp bot link.
 *
 * Set ONE of these in the environment (Vercel → Project → Environment):
 *   NEXT_PUBLIC_WHATSAPP_NUMBER  — the bot's number in digits, e.g. 2348012345678
 *   NEXT_PUBLIC_WHATSAPP_URL     — or a full chat link (wa.me / business link)
 *
 * When neither is set, `whatsappBotUrl()` returns null and every bot CTA hides
 * itself — so nothing breaks before you configure the number.
 */

const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
const FULL_URL = (process.env.NEXT_PUBLIC_WHATSAPP_URL ?? "").trim();

/**
 * Returns the click-to-chat URL, or null if no number/URL is configured.
 * `prefill` seeds the chat's first message (ignored when a full URL is set,
 * since the deployer controls that link entirely).
 */
export function whatsappBotUrl(prefill = "Hi"): string | null {
  if (FULL_URL) return FULL_URL;
  if (NUMBER) return `https://wa.me/${NUMBER}?text=${encodeURIComponent(prefill)}`;
  return null;
}
