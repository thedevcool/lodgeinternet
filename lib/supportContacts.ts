/**
 * Lodge Internet's own support agents on WhatsApp. Hostel-specific agents are
 * added on top of these from GET /api/support-contacts?hostelId=… (plans page).
 * Numbers are in international format, digits only (wa.me links).
 */
export type SupportAgent = { name: string; phone: string };

export const CORE_SUPPORT_AGENTS: SupportAgent[] = [
  { name: "Davo", phone: "2348130437519" },
  { name: "Stephen", phone: "2347048817060" },
];

export function whatsappChatLink(phone: string): string {
  return `https://wa.me/${phone}`;
}
