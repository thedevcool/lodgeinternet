/**
 * Server-side Paystack transaction verification.
 *
 * This is the missing payment-proof step: before any endpoint hands out a
 * data code or a TV subscription, it must confirm with Paystack — using the
 * secret key, never client-supplied data — that the reference actually
 * corresponds to a *successful* charge for *at least* the plan's price.
 *
 * Without this, a logged-in user can POST any string as `paymentRef` and
 * receive real inventory for free, draining stock so that genuine paying
 * customers get "no codes available".
 */

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type PaystackVerifyError =
  | "NOT_CONFIGURED" // PAYSTACK_SECRET_KEY missing — fail closed
  | "VERIFY_FAILED" // network / non-200 / malformed response
  | "NOT_SUCCESS" // transaction exists but did not succeed
  | "AMOUNT_MISMATCH" // paid less than the plan price
  | "CURRENCY_MISMATCH"; // paid in the wrong currency

export interface PaystackTransaction {
  reference: string;
  /** amount in the smallest currency unit (kobo for NGN) */
  amount: number;
  currency: string;
  status: string;
  email: string;
  metadata: any;
}

export type PaystackVerifyResult =
  | { ok: true; data: PaystackTransaction }
  | { ok: false; code: PaystackVerifyError; message: string };

interface VerifyParams {
  reference: string;
  /** Minimum acceptable amount in kobo (typically plan.price * 100). */
  minAmountKobo: number;
  /** Expected currency. Defaults to NGN. */
  currency?: string;
}

/**
 * Verify a Paystack transaction reference against the live Paystack API.
 *
 * Returns ok:true only when the charge succeeded AND was for at least the
 * expected amount in the expected currency. Overpayment (e.g. the ₦100 bank
 * surcharge the client adds, or future fee changes) is accepted; underpayment
 * is rejected.
 */
export async function verifyPaystackPayment(
  params: VerifyParams,
): Promise<PaystackVerifyResult> {
  const { reference, minAmountKobo, currency = "NGN" } = params;

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // Fail closed: if we can't verify, we must not issue inventory.
    console.error("PAYSTACK_SECRET_KEY is not configured — cannot verify payments");
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Payment verification is unavailable. Please contact support.",
    };
  }

  if (!reference) {
    return {
      ok: false,
      code: "VERIFY_FAILED",
      message: "Missing payment reference.",
    };
  }

  // Retry transient failures (network blips, Paystack 5xx) a couple of times
  // before giving up — a real payment must not be rejected just because one
  // verify call hiccupped. Definitive responses (2xx/4xx with a body) are not
  // retried.
  const url = `${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`;
  const MAX_ATTEMPTS = 3;
  let json: any = null;
  let succeeded = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        // Never serve a cached verification result.
        cache: "no-store",
      });

      // 5xx from Paystack is transient — back off and retry.
      if (res.status >= 500) {
        console.error(`Paystack verify HTTP ${res.status} (attempt ${attempt})`);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(400 * attempt);
          continue;
        }
        break;
      }

      json = await res.json().catch(() => null);
      if (res.ok && json && json.status === true && json.data) {
        succeeded = true;
      }
      break; // definitive response — stop retrying
    } catch (err) {
      console.error(`Paystack verify request failed (attempt ${attempt}):`, err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
    }
  }

  if (!succeeded) {
    return {
      ok: false,
      code: "VERIFY_FAILED",
      message:
        "We couldn't confirm this payment with Paystack just now. If you were charged, your code will be delivered automatically shortly — please keep your payment reference.",
    };
  }

  const data = json.data;

  if (data.status !== "success") {
    return {
      ok: false,
      code: "NOT_SUCCESS",
      message: "This payment was not completed successfully.",
    };
  }

  const paidAmount = typeof data.amount === "number" ? data.amount : -1;
  if (paidAmount < minAmountKobo) {
    console.error("Paystack amount mismatch:", {
      reference,
      paidAmount,
      minAmountKobo,
    });
    return {
      ok: false,
      code: "AMOUNT_MISMATCH",
      message: "The amount paid does not match the plan price.",
    };
  }

  const paidCurrency = (data.currency || "NGN").toUpperCase();
  if (paidCurrency !== currency.toUpperCase()) {
    return {
      ok: false,
      code: "CURRENCY_MISMATCH",
      message: "The payment currency does not match.",
    };
  }

  return {
    ok: true,
    data: {
      reference: data.reference || reference,
      amount: paidAmount,
      currency: paidCurrency,
      status: data.status,
      email: data.customer?.email || "",
      metadata: data.metadata || {},
    },
  };
}

/**
 * Map a verification failure to an HTTP status code.
 * - NOT_CONFIGURED  → 503 (our problem, transient)
 * - VERIFY_FAILED   → 502 (upstream/uncertain — let the client retry)
 * - everything else → 402 (payment genuinely not acceptable)
 */
export function paystackErrorStatus(code: PaystackVerifyError): number {
  switch (code) {
    case "NOT_CONFIGURED":
      return 503;
    case "VERIFY_FAILED":
      return 502;
    default:
      return 402;
  }
}
