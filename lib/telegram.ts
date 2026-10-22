/**
 * Telegram bot link — the same bot as WhatsApp, where messages are free, so
 * balance checks there are unlimited.
 *
 * Set ONE of these in the environment:
 *   NEXT_PUBLIC_TELEGRAM_BOT_USERNAME — the bot's username, e.g. lodgeinternetBot
 *   NEXT_PUBLIC_TELEGRAM_URL          — or a full t.me link
 *
 * When neither is set, `telegramBotUrl()` returns null and every Telegram
 * button hides itself — so nothing breaks before it's configured.
 */

const USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
const FULL_URL = (process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "").trim();

/**
 * The bot link, or null if none is configured. `source` rides along as the
 * /start payload (the bot treats any /start as "hi"), so links from the site
 * can be told apart from links sent on WhatsApp (`?start=wa`). Telegram only
 * allows A–Z, a–z, 0–9, _ and - there, up to 64 characters.
 */
export function telegramBotUrl(source = "site"): string | null {
  if (FULL_URL) return FULL_URL;
  if (!USERNAME) return null;
  const payload = source.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return `https://t.me/${USERNAME}${payload ? `?start=${payload}` : ""}`;
}
