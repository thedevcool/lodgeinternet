import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { decryptCode } from "@/lib/dataCodeCrypto";
import { sendEmail } from "@/lib/email/emailService";
import {
  getDeviceCodeEmail,
  getCodePurchaseAdminNotification,
  getDeliveryFailedAdminNotification,
} from "@/lib/email/emailTemplates";

/**
 * Paystack Webhook Handler
 *
 * Endpoint: POST /api/webhooks/paystack
 *
 * This is the reliable server-side handler for completed payments.
 * The client-side callback still works for instant UX, but this webhook
 * ensures purchases are recorded even if the user closes the browser.
 *
 * Idempotency is guaranteed by the paymentRef check — if the client
 * callback already claimed the code, this webhook will be a no-op.
 */

function verifyPaystackSignature(body: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const hash = crypto
    .createHmac("sha512", secret)
    .update(body)
    .digest("hex");
  return hash === signature;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process successful charges
  if (event.event !== "charge.success") {
    return NextResponse.json({ message: "Ignored" });
  }

  const data = event.data;
  const paymentRef: string = data.reference || "";
  const customerEmail: string = data.customer?.email || "";
  const metadata = data.metadata || {};
  const planId: string = metadata.planId || "";
  const planType: string = metadata.planType || "device";
  const hostel: string = metadata.hostel || "";
  const reservationId: string = metadata.reservationId || "";
  // Amount actually charged, in kobo. Authoritative because the event is
  // signed by Paystack — used to reject under-paid charges whose metadata
  // points at a more expensive plan.
  const amountKobo: number = typeof data.amount === "number" ? data.amount : 0;

  if (!paymentRef || !planId || !hostel) {
    // Missing critical metadata — nothing we can do, but acknowledge the webhook
    console.error("Paystack webhook: missing metadata", {
      paymentRef,
      planId,
      hostel,
    });
    return NextResponse.json({ message: "Missing metadata" });
  }

  try {
    if (planType === "tv") {
      await handleTvPurchase({ paymentRef, customerEmail, planId, hostel, metadata, amountKobo });
    } else {
      await handleDeviceCodeClaim({ paymentRef, customerEmail, planId, hostel, reservationId, amountKobo });
    }
  } catch (err: any) {
    console.error("Paystack webhook processing error:", err);

    if (err.message === "ALREADY_CLAIMED") {
      // The client path already issued the code. Make sure the admin still got
      // the backup email even if that path's fire-and-forget send was dropped.
      if (planType !== "tv") {
        await sendAdminBackupIfMissing(paymentRef).catch((bErr) => {
          console.error("Failed admin backup backstop:", bErr);
        });
      }
      return NextResponse.json({ message: err.message });
    }

    // NO_CODES / PLAN_NOT_FOUND / AMOUNT_MISMATCH: record an unfulfilled-purchase
    // stub + alert admin. Return 200 so Paystack doesn't retry endlessly — these
    // require human action (restock, fix plan, or investigate underpayment), not
    // webhook retries.
    if (
      err.message === "NO_CODES" ||
      err.message === "PLAN_NOT_FOUND" ||
      err.message === "AMOUNT_MISMATCH"
    ) {
      await recordUnfulfilledPurchase({
        planId,
        customerEmail,
        paymentRef,
        hostel,
        reason:
          err.message === "NO_CODES"
            ? "no_stock"
            : err.message === "PLAN_NOT_FOUND"
              ? "plan_missing"
              : "unknown",
      }).catch((recErr) => {
        console.error("Failed to record unfulfilled purchase from webhook:", recErr);
      });
      return NextResponse.json({ message: err.message });
    }

    // For unexpected errors, return 500 so Paystack retries
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: "OK" });
}

/**
 * Record a paid-but-unfulfilled purchase. Idempotent on paymentRef.
 * Mirrors the same helper in /api/data-codes/claim so both delivery paths
 * leave a paper trail.
 */
async function recordUnfulfilledPurchase({
  planId,
  customerEmail,
  paymentRef,
  hostel,
  reason,
}: {
  planId: string;
  customerEmail: string;
  paymentRef: string;
  hostel: string;
  reason: "no_stock" | "plan_missing" | "unknown";
}) {
  const db = getAdminDb();

  if (paymentRef) {
    const existing = await db
      .collection("dataPurchases")
      .where("paymentRef", "==", paymentRef)
      .limit(1)
      .get();
    if (!existing.empty) return;
  }

  let planName = "";
  let price = 0;
  let usersCount: number | null = null;
  if (planId) {
    try {
      const planDoc = await db.collection("dataPlans").doc(planId).get();
      if (planDoc.exists) {
        const d = planDoc.data()!;
        planName = d.name || "";
        price = d.price || 0;
        usersCount = d.usersCount || null;
      }
    } catch {
      /* fall through */
    }
  }

  await db.collection("dataPurchases").add({
    planId,
    planName,
    planType: "device",
    usersCount,
    price,
    codeId: null,
    customerEmail: customerEmail || "N/A",
    paymentRef: paymentRef || "N/A",
    hostel: hostel || "N/A",
    claimedCode: null,
    deliveryStatus: "no_stock",
    deliveryReason: reason,
    emailSent: false,
    purchasedAt: FieldValue.serverTimestamp(),
  });

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "lodge.internet@gmail.com";
    await sendEmail({
      to: adminEmail,
      subject: `⚠️ Unfulfilled Purchase — ${hostel || "Unknown hostel"} — ${paymentRef || "no ref"}`,
      html: getDeliveryFailedAdminNotification({
        customerEmail: customerEmail || "N/A",
        planName: planName || "Unknown plan",
        hostel: hostel || "N/A",
        paymentRef: paymentRef || "N/A",
        reason,
      }),
      senderName: "Lodge Internet System",
    });
  } catch (alertErr) {
    console.error("Failed to send delivery-failed admin alert:", alertErr);
  }
}

// ─── Device code claim (mirrors /api/data-codes/claim logic) ────────────────

async function handleDeviceCodeClaim({
  paymentRef,
  customerEmail,
  planId,
  hostel,
  reservationId,
  amountKobo,
}: {
  paymentRef: string;
  customerEmail: string;
  planId: string;
  hostel: string;
  reservationId?: string;
  amountKobo: number;
}) {
  const db = getAdminDb();

  // Idempotency: already claimed by the client callback?
  const existing = await db
    .collection("dataPurchases")
    .where("paymentRef", "==", paymentRef)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error("ALREADY_CLAIMED");
  }

  // Atomic: find code → delete → log purchase
  const result = await db.runTransaction(async (transaction) => {
    let codeRef: FirebaseFirestore.DocumentReference | null = null;

    // Prefer the reservation made before Paystack opened — guarantees we hand
    // back the exact code that was held for this buyer.
    if (reservationId) {
      const reservedRef = db.collection("dataCodes").doc(reservationId);
      const reservedSnap = await transaction.get(reservedRef);
      if (reservedSnap.exists) {
        const rd = reservedSnap.data()!;
        // Verify ownership by email (set by all reservation paths) or
        // fall back to plan+hostel match for older reservations.
        const emailMatch =
          customerEmail &&
          (rd.reservedEmail || "").toLowerCase() === customerEmail.toLowerCase();
        if (rd.planId === planId && rd.hostel === hostel && emailMatch) {
          codeRef = reservedRef;
        }
      }
    }

    // Fallback: reservation lost / expired / never sent. Pick any code that
    // isn't actively reserved by someone else right now.
    if (!codeRef) {
      const codesSnap = await transaction.get(
        db
          .collection("dataCodes")
          .where("planId", "==", planId)
          .where("hostel", "==", hostel)
          .limit(25),
      );

      const nowMs = Date.now();
      const candidate = codesSnap.docs.find((doc) => {
        const r = doc.data().reservedUntil as
          | FirebaseFirestore.Timestamp
          | undefined;
        if (!r) return true;
        return r.toMillis() <= nowMs;
      });

      if (!candidate) throw new Error("NO_CODES");
      codeRef = candidate.ref;
    }

    const freshCode = await transaction.get(codeRef);
    if (!freshCode.exists) throw new Error("NO_CODES");

    const codeDoc = freshCode;
    const decryptedCode = decryptCode(
      freshCode.data()!.encryptedCode as string,
    );

    const planDoc = await transaction.get(
      db.collection("dataPlans").doc(planId),
    );
    if (!planDoc.exists) throw new Error("PLAN_NOT_FOUND");

    const planData = planDoc.data()!;

    // Reject under-payment: the signed amount must cover the plan price.
    if (amountKobo < Math.round((Number(planData.price) || 0) * 100)) {
      console.error("Webhook amount mismatch (device):", {
        paymentRef,
        amountKobo,
        planPrice: planData.price,
      });
      throw new Error("AMOUNT_MISMATCH");
    }

    transaction.delete(codeDoc.ref);

    const purchaseRef = db.collection("dataPurchases").doc();
    transaction.set(purchaseRef, {
      planId,
      planName: planData.name,
      planType: planData.planType || "device",
      usersCount: planData.usersCount || null,
      price: planData.price,
      codeId: codeDoc.id,
      customerEmail: customerEmail || "N/A",
      paymentRef,
      hostel,
      claimedCode: decryptedCode,
      deliveryStatus: "delivered",
      emailSent: false,
      adminNotified: false,
      purchasedAt: FieldValue.serverTimestamp(),
    });

    return { decryptedCode, planData, purchaseRefId: purchaseRef.id };
  });

  // Send emails (non-critical)
  let emailSent = false;
  if (customerEmail) {
    try {
      let hostelPassword: string | undefined;
      const hostelSnap = await db
        .collection("hostels")
        .where("name", "==", hostel)
        .limit(1)
        .get();
      if (!hostelSnap.empty) {
        hostelPassword = hostelSnap.docs[0].data().password || undefined;
      }

      const emailHtml = getDeviceCodeEmail({
        customerEmail,
        planName: result.planData.name,
        usersCount: result.planData.usersCount || 0,
        duration: result.planData.duration
          ? `${result.planData.duration} days`
          : "As specified",
        price: result.planData.price,
        code: result.decryptedCode,
        hostel,
        hostelPassword,
      });

      await sendEmail({
        to: customerEmail,
        subject: `Your Lodge Internet Access Code - ${result.planData.name} (${hostel})`,
        html: emailHtml,
        senderName: "Lodge Internet",
      });
      emailSent = true;
    } catch (emailError) {
      console.error("Webhook: error sending code email:", emailError);
    }
  }

  try {
    await db
      .collection("dataPurchases")
      .doc(result.purchaseRefId)
      .update({
        emailSent,
        emailSentAt: emailSent ? FieldValue.serverTimestamp() : null,
      });
  } catch (markErr) {
    console.error("Webhook: failed to update emailSent flag:", markErr);
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "lodge.internet@gmail.com";
    const adminHtml = getCodePurchaseAdminNotification({
      customerEmail: customerEmail || "N/A",
      planName: result.planData.name,
      usersCount: result.planData.usersCount || 0,
      price: result.planData.price,
      hostel,
      paymentRef,
      claimedCode: result.decryptedCode,
    });

    await sendEmail({
      to: adminEmail,
      subject: `New Purchase: ${result.planData.name} - ${hostel}`,
      html: adminHtml,
    });
    try {
      await db
        .collection("dataPurchases")
        .doc(result.purchaseRefId)
        .update({ adminNotified: true });
    } catch (flagErr) {
      console.error("Webhook: failed to set adminNotified flag:", flagErr);
    }
  } catch (adminEmailError) {
    console.error("Webhook: error sending admin email:", adminEmailError);
  }
}

/**
 * Backstop for the admin code-backup email.
 *
 * The client `/claim` path sends the admin notification (which carries the
 * issued code) as a fire-and-forget side-effect, which a serverless freeze
 * can drop. When this webhook later sees the purchase as ALREADY_CLAIMED, it
 * re-sends the admin backup IF it wasn't already sent (adminNotified flag).
 * Idempotent: it no-ops once the flag is set, and only ever touches device
 * purchases that actually have a code on file.
 */
async function sendAdminBackupIfMissing(paymentRef: string) {
  if (!paymentRef) return;
  const db = getAdminDb();

  const snap = await db
    .collection("dataPurchases")
    .where("paymentRef", "==", paymentRef)
    .limit(1)
    .get();
  if (snap.empty) return;

  const doc = snap.docs[0];
  const d = doc.data();

  if (d.adminNotified === true) return; // already emailed
  if (!d.claimedCode) return; // no code to back up (e.g. unfulfilled stub)

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "lodge.internet@gmail.com";
    await sendEmail({
      to: adminEmail,
      subject: `New Purchase (backup): ${d.planName || "Plan"} - ${d.hostel || "Hostel"}`,
      html: getCodePurchaseAdminNotification({
        customerEmail: d.customerEmail || "N/A",
        planName: d.planName || "",
        usersCount: d.usersCount || 0,
        price: d.price || 0,
        hostel: d.hostel || "N/A",
        paymentRef: d.paymentRef || "N/A",
        claimedCode: d.claimedCode,
      }),
    });
    await doc.ref.update({ adminNotified: true });
  } catch (err) {
    console.error("Webhook: failed to send admin backup email:", err);
  }
}

// ─── TV purchase (mirrors /api/tv/purchase logic) ───────────────────────────

async function handleTvPurchase({
  paymentRef,
  customerEmail,
  planId,
  hostel,
  metadata,
  amountKobo,
}: {
  paymentRef: string;
  customerEmail: string;
  planId: string;
  hostel: string;
  metadata: any;
  amountKobo: number;
}) {
  const db = getAdminDb();

  // Idempotency: check if subscription already exists for this paymentRef
  const existing = await db
    .collection("tvSubscriptions")
    .where("paymentRef", "==", paymentRef)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error("ALREADY_CLAIMED");
  }

  // Get plan details
  const planDoc = await db.collection("dataPlans").doc(planId).get();
  if (!planDoc.exists || planDoc.data()?.planType !== "tv") {
    throw new Error("PLAN_NOT_FOUND");
  }

  const plan = planDoc.data()!;

  // Reject under-payment: the signed amount must cover the plan price.
  if (amountKobo < Math.round((Number(plan.price) || 0) * 100)) {
    console.error("Webhook amount mismatch (tv):", {
      paymentRef,
      amountKobo,
      planPrice: plan.price,
    });
    throw new Error("AMOUNT_MISMATCH");
  }

  const subscriptionData: Record<string, any> = {
    email: customerEmail,
    planId,
    planName: plan.name,
    duration: plan.duration,
    price: plan.price,
    paymentRef,
    paymentStatus: "paid",
    subscriptionStatus: "pending_activation",
    hostel: hostel || "N/A",
    name: metadata.name || customerEmail.split("@")[0],
    userId: "",
    // Webhook can't collect a MAC — flag so the dashboard prompts the user.
    migrationNote: "needs_mac_entry",
    paidAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection("tvSubscriptions").add(subscriptionData);
}
