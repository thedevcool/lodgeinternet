/**
 * Lodge Internet's own support agent on WhatsApp, shown for every hostel.
 * Hostel-specific agents (Stephen among them since 2026-11-12) are added on
 * top from GET /api/support-contacts?hostelId=… (plans page): an admin
 * account with a WhatsApp number and its hostels. Numbers are in
 * international format, digits only (wa.me links). The backend
 * (services/app_config.py) and the bot list the same one.
 */
export type SupportAgent = { name: string; phone: string };

export const CORE_SUPPORT_AGENTS: SupportAgent[] = [{ name: "Davo", phone: "2348130437519" }];

export function whatsappChatLink(phone: string): string {
  return `https://wa.me/${phone}`;
}
