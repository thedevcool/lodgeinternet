import { apiFetch } from "@/lib/apiClient";

/**
 * The customer's wallet: types, money formatting and the calls behind it.
 *
 * A wallet is topped up by transferring to the customer's own bank account
 * number (a Paystack "dedicated virtual account", DVA) and can only be spent
 * on plans. Card (top-ups and checkout) is offered only when the bank
 * couldn't open that account even with the customer's phone (`dvaFailed`). Every amount from the API is in KOBO — always show it through
 * `naira()`, never raw.
 */

/** "Point at the wallet": fired by the welcome sheet on the dashboard. */
export const WALLET_SETUP_EVENT = "lodge:wallet-setup";

export type Dva = { account_number: string; bank_name: string; account_name: string };

export type WalletActivity = {
  type: "wallet_topup" | "wallet_spend" | "wallet_spend_reversal" | "wallet_adjustment" | string;
  reference: string;
  changeKobo: number; // positive = money in, negative = money out
  at: string | null;
  metadata: Record<string, unknown>;
};

export type Wallet =
  | { available: false }
  | {
      available: true;
      balanceKobo: number;
      dva: Dva | null;
      dvaFailed: boolean;
      hasPhone: boolean;
      activity: WalletActivity[];
    };

/** A paid order: the code (data plans) or the TV result. */
export type ReadyOrder =
  | { status: "ready"; type: "data"; code: string; planName: string; purchaseId?: string; balanceKobo?: number; paidFromWallet?: boolean }
  | { status: "ready"; type: "tv"; planName: string; tvStatus?: string; message?: string; balanceKobo?: number; paidFromWallet?: boolean };

/** A bank-transfer order still waiting for the customer's transfer. */
export type WaitingOrder = {
  status: "waiting";
  pendingId: string;
  reservationId?: string;
  amountKobo: number;
  toTransferKobo: number;
  dva: Dva;
};

/** ₦1,705 from 170500 kobo. Kobo is dropped only when it is zero. */
export function naira(kobo: number): string {
  const value = (kobo || 0) / 100;
  return `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * A light check before sending a phone number: 10–13 digits once spaces,
 * dashes and a leading "+" are ignored. The server does the real Nigerian
 * number validation and answers INVALID_PHONE with its own message.
 */
export function looksLikePhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-()+]/g, "");
  return /^\d{10,13}$/.test(digits);
}

/** JSON body of a response, or {} when there isn't one. */
async function body(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

/** The wallet, or null if it couldn't be loaded (treated like "unavailable"). */
export async function fetchWallet(): Promise<Wallet | null> {
  try {
    const res = await apiFetch("/api/wallet");
    if (!res.ok) return null;
    return (await body(res)) as Wallet;
  } catch {
    return null;
  }
}

/** Save the phone number. Throws with the server's message (INVALID_PHONE). */
export async function savePhone(phone: string): Promise<string> {
  const res = await apiFetch("/api/account/phone", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: phone.trim() }),
  });
  const data = await body(res);
  if (!res.ok) throw Object.assign(new Error(data.error || "Couldn't save your phone number."), { code: data.code });
  return data.phone;
}

/** Ask the bank for the customer's own account number. Throws with the
 * server's message; `code` is PHONE_REQUIRED or DVA_UNAVAILABLE. */
export async function requestDva(phone?: string): Promise<Dva> {
  const res = await apiFetch("/api/wallet/dva", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(phone ? { phone: phone.trim() } : {}),
  });
  const data = await body(res);
  if (!res.ok) throw Object.assign(new Error(data.error || "Couldn't get your account number."), { code: data.code });
  return data.dva as Dva;
}

/** A started card top-up: what reaches the wallet, the card fee the
 * customer pays on top, and Paystack's page to pay it on. */
export type CardTopup = { authorizationUrl: string; creditKobo: number; feeKobo: number; totalKobo: number };

/** Start a card top-up (only allowed when `dvaFailed`). Paystack brings the
 * customer back to /dashboard?topup=card. */
export async function startCardTopup(amountNaira: number): Promise<CardTopup> {
  const { ok, data } = await postJson("/api/wallet/topup/card", { amountNaira });
  if (!ok) throw Object.assign(new Error(data.error || "Couldn't start the top-up."), { code: data.code });
  return data as CardTopup;
}

/** Back from Paystack: confirm the top-up. Resolves with the new balance. */
export async function confirmCardTopup(reference: string): Promise<number> {
  const { ok, data } = await postJson("/api/wallet/topup/card/verify", { reference });
  if (!ok) throw Object.assign(new Error(data.error || "We couldn't confirm your top-up yet."), { code: data.code });
  return data.balanceKobo as number;
}

/** POST a JSON body and hand back status + parsed body (errors are `{error, code}`). */
export async function postJson(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, data: await body(res) };
}
