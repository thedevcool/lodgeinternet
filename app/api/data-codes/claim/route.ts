import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { decryptCode } from "@/lib/dataCodeCrypto";
import { sendEmail } from "@/lib/email/emailService";
import {
  getDeviceCodeEmail,
  getCodePurchaseAdminNotification,
  getDeliveryFailedAdminNotification,
} from "@/lib/email/emailTemplates";
import type { Firestore } from "firebase-admin/firestore";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";
import { verifyPaystackPayment, paystackErrorStatus } from "@/lib/paystackVerify";

export async function POST(request: Request) {
  let planId = "";
  let customerEmail = "";
  let paymentRef = "";
  let hostel = "";
  let reservationId = "";
  // Flips true once Paystack confirms the charge. After this point, any failure
  // means the customer already paid — so we must record + alert, never 500 silently.
  let paymentVerified = false;

  try {
    const body = await request.json();
    planId = typeof body.planId === "string" ? body.planId.trim() : "";
    customerEmail = typeof body.email === "string" ? body.email.trim() : "";
    paymentRef = typeof body.paymentRef === "string" ? body.paymentRef.trim() : "";
    hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";
    reservationId =
      typeof body.reservationId === "string" ? body.reservationId.trim() : "";

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    if (!hostel) {
      return NextResponse.json({ error: "Missing hostel" }, { status: 400 });
    }

    // ── Server-side auth: verify token, hostel match, fresh session ──
    const auth = await verifyAuth(request, body, {
      requireFreshSession: true,
      expectedHostel: hostel,
    });

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    // Bind the purchase to the authenticated account, not whatever email the
    // client posts. The dashboard's reveal/resend recovery is keyed on this
    // address, so it MUST match the signed-in user or they lose access to
    // their own code.
    customerEmail = auth.user.email;

    if (!paymentRef || paymentRef === "N/A") {
      return NextResponse.json(
        { error: "Missing payment reference." },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // Idempotency check + plan lookup run in parallel (independent reads) to
    // shave a round-trip off the critical path.
    const [existingPurchase, planForPrice] = await Promise.all([
      db
        .collection("dataPurchases")
        .where("paymentRef", "==", paymentRef)
        .limit(1)
        .get(),
      db.collection("dataPlans").doc(planId).get(),
    ]);

    // If this paymentRef already claimed a code, return it.
    if (!existingPurchase.empty) {
      const existing = existingPurchase.docs[0].data();
      return NextResponse.json({
        code: existing.claimedCode || "(already claimed — check your email)",
        duplicate: true,
      });
    }

    if (!planForPrice.exists) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const planPrice = Number(planForPrice.data()!.price) || 0;

    // ── Verify the payment with Paystack BEFORE issuing any code ──────────────
    // This is the gate that prevents free codes. We confirm with Paystack
    // (using the secret key, never client data) that this reference is a
    // SUCCESSFUL charge for at least this plan's price. An empty/forged/
    // underpaid reference can never get past here.
    const verification = await verifyPaystackPayment({
      reference: paymentRef,
      minAmountKobo: Math.round(planPrice * 100),
    });

    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.message, code: verification.code },
        { status: paystackErrorStatus(verification.code) },
      );
    }
    paymentVerified = true;

    // Atomic transaction: find a code, delete it, and log the purchase in one go
    const result = await db.runTransaction(async (transaction) => {
      let codeRef: FirebaseFirestore.DocumentReference | null = null;

      // Preferred path: caller holds a reservation made via /api/data-codes/reserve.
      // We bind the claim to that specific code so we don't race other buyers.
      if (reservationId) {
        const reservedRef = db.collection("dataCodes").doc(reservationId);
        const reservedSnap = await transaction.get(reservedRef);
        if (reservedSnap.exists) {
          const rd = reservedSnap.data()!;
          const emailMatch =
            customerEmail &&
            (rd.reservedEmail || "").toLowerCase() === customerEmail.toLowerCase();
          const uidMatch = rd.reservedBy === auth.user.uid;
          if (
            rd.planId === planId &&
            rd.hostel === hostel &&
            (emailMatch || uidMatch)
          ) {
            codeRef = reservedRef;
          }
        }
      }

      // Fallback: the reservationId binding above didn't match (stale/lost id,
      // a hold that wasn't refreshed, planId/hostel drift, etc.). Find a
      // claimable code for this plan + hostel. A code is claimable if it is:
      //   • free (no reservation), or
      //   • an expired reservation, or
      //   • a reservation THIS SAME USER holds.
      // The last case is the critical one: a buyer who paid must always be able
      // to claim the code they themselves reserved — otherwise the code stays
      // locked under their own future-dated reservation and they get NO_CODES
      // despite a successful payment.
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
          const data = doc.data();
          const r = data.reservedUntil as
            | FirebaseFirestore.Timestamp
            | undefined;
          if (!r) return true;
          if (r.toMillis() <= nowMs) return true;
          return data.reservedBy === auth.user.uid;
        });

        if (!candidate) {
          throw new Error("NO_CODES");
        }
        codeRef = candidate.ref;
      }

      // Re-read inside transaction to ensure it still exists (prevents race condition)
      const freshCode = await transaction.get(codeRef);
      if (!freshCode.exists) {
        throw new Error("NO_CODES");
      }

      const codeDoc = freshCode;
      const decryptedCode = decryptCode(freshCode.data()!.encryptedCode as string);

      // Get plan details
      const planDoc = await transaction.get(db.collection("dataPlans").doc(planId));
      if (!planDoc.exists) {
        throw new Error("PLAN_NOT_FOUND");
      }

      const planData = planDoc.data()!;

      // Delete the code atomically
      transaction.delete(codeDoc.ref);

      // Log the purchase atomically
      const purchaseRef = db.collection("dataPurchases").doc();
      transaction.set(purchaseRef, {
        planId,
        planName: planData.name,
        planType: planData.planType || "device",
        usersCount: planData.usersCount || null,
        price: planData.price,
        codeId: codeDoc.id,
        customerEmail: customerEmail || "N/A",
        paymentRef: paymentRef || "N/A",
        hostel: hostel || "N/A",
        claimedCode: decryptedCode,
        deliveryStatus: "delivered",
        emailSent: false,
        // Admin backup email tracking. Set true once the admin notification
        // (which carries the issued code) is sent. If the fire-and-forget
        // side-effects below are dropped by a serverless freeze, the Paystack
        // webhook backstop re-sends it using this flag to avoid duplicates.
        adminNotified: false,
        purchasedAt: FieldValue.serverTimestamp(),
      });

      return { decryptedCode, planData, purchaseRefId: purchaseRef.id };
    });

    // Emails + emailSent flag run AFTER the response is sent so the UI
    // shows the access code immediately. Each sendEmail() can take 1–3s
    // against Gmail SMTP; awaiting them here is what was making the popup
    // feel slow. The code is already on file in dataPurchases.claimedCode,
    // and the dashboard's "Resend email" button covers any background failure.
    //
    // NOTE: in Vercel/serverless, the function may shut down once the
    // response stream closes. In practice the runtime keeps the process
    // alive long enough for these tasks, but we accept that a rare cold-
    // termination could drop the email — that's why the customer's modal
    // (with the code) and the dashboard recovery exist.
    void deliverPostClaimSideEffects({
      db,
      purchaseRefId: result.purchaseRefId,
      customerEmail,
      planName: result.planData.name,
      planDuration: result.planData.duration,
      planUsersCount: result.planData.usersCount,
      planPrice: result.planData.price,
      decryptedCode: result.decryptedCode,
      hostel,
      paymentRef,
    });

    return NextResponse.json({ code: result.decryptedCode });
  } catch (error: any) {
    // NO_CODES: we already collected payment but inventory is empty. Record
    // the unfulfilled purchase so admin can resolve, and surface a clear
    // recovery message to the customer.
    if (error?.message === "NO_CODES") {
      await recordUnfulfilledPurchase({
        planId,
        customerEmail,
        paymentRef,
        hostel,
        reason: "no_stock",
      }).catch((recErr) => {
        console.error("Failed to record unfulfilled purchase:", recErr);
      });

      return NextResponse.json(
        {
          error:
            "Your payment was received but no codes are currently available. Our team has been notified and will contact you shortly. Please keep your payment reference safe.",
          code: "NO_CODES",
          paymentRef: paymentRef || null,
        },
        { status: 409 },
      );
    }
    if (error?.message === "PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    console.error("Error claiming data code:", error);
    // If the payment was already verified, the customer has paid and something
    // failed while issuing the code (e.g. a misconfigured DATA_CODE_SECRET_KEY
    // that can't decrypt the stored code). Never swallow a paid order: record
    // it so it's recoverable, alert the admin, and tell the customer their
    // money is safe.
    if (paymentVerified) {
      await recordUnfulfilledPurchase({
        planId,
        customerEmail,
        paymentRef,
        hostel,
        reason: "unknown",
      }).catch((recErr) => {
        console.error(
          "Failed to record unfulfilled purchase (error path):",
          recErr,
        );
      });
      return NextResponse.json(
        {
          error:
            "Your payment was received but we hit a snag delivering your code. Our team has been notified and will sort it out shortly — please keep your payment reference safe.",
          code: "DELIVERY_ERROR",
          paymentRef: paymentRef || null,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Failed to claim data code" },
      { status: 500 },
    );
  }
}

/**
 * Record a paid-but-unfulfilled purchase so we never lose track of customer
 * payments. Idempotent on paymentRef.
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

  if (paymentRef && paymentRef !== "N/A") {
    const existing = await db
      .collection("dataPurchases")
      .where("paymentRef", "==", paymentRef)
      .limit(1)
      .get();
    if (!existing.empty) return; // already recorded
  }

  let planName = "";
  let price = 0;
  let usersCount: number | null = null;
  if (planId) {
    try {
      const planDoc = await db.collection("dataPlans").doc(planId).get();
      if (planDoc.exists) {
        const data = planDoc.data()!;
        planName = data.name || "";
        price = data.price || 0;
        usersCount = data.usersCount || null;
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

  // Alert admin immediately so this can be resolved fast.
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

/**
 * Background work that runs AFTER the claim response is returned:
 *  - send the code email to the customer
 *  - flip emailSent / emailSentAt on the purchase row
 *  - send the admin notification (now includes the code for dispute resolution)
 *
 * Anything in here can fail without affecting the customer's checkout —
 * they already have the code in the modal and the code is persisted to
 * dataPurchases.claimedCode, which the dashboard can resend on demand.
 */
async function deliverPostClaimSideEffects(args: {
  db: Firestore;
  purchaseRefId: string;
  customerEmail: string;
  planName: string;
  planDuration?: number;
  planUsersCount?: number;
  planPrice: number;
  decryptedCode: string;
  hostel: string;
  paymentRef: string;
}) {
  const {
    db,
    purchaseRefId,
    customerEmail,
    planName,
    planDuration,
    planUsersCount,
    planPrice,
    decryptedCode,
    hostel,
    paymentRef,
  } = args;

  let emailSent = false;
  if (customerEmail && customerEmail !== "N/A") {
    try {
      let hostelPassword: string | undefined;
      try {
        const hostelSnap = await db
          .collection("hostels")
          .where("name", "==", hostel)
          .limit(1)
          .get();
        if (!hostelSnap.empty) {
          hostelPassword = hostelSnap.docs[0].data().password || undefined;
        }
      } catch {
        // hostel password is optional in the email; ignore lookup failures
      }

      await sendEmail({
        to: customerEmail,
        subject: `Your Lodge Internet Access Code - ${planName} (${hostel})`,
        html: getDeviceCodeEmail({
          customerEmail,
          planName,
          usersCount: planUsersCount || 0,
          duration: planDuration ? `${planDuration} days` : "As specified",
          price: planPrice,
          code: decryptedCode,
          hostel,
          hostelPassword,
        }),
        senderName: "Lodge Internet",
      });
      emailSent = true;
    } catch (emailError) {
      console.error("Error sending code email (background):", emailError);
    }

    try {
      await db
        .collection("dataPurchases")
        .doc(purchaseRefId)
        .update({
          emailSent,
          emailSentAt: emailSent ? FieldValue.serverTimestamp() : null,
        });
    } catch (markErr) {
      console.error("Failed to update emailSent flag (background):", markErr);
    }
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "lodge.internet@gmail.com";
    await sendEmail({
      to: adminEmail,
      subject: `New Purchase: ${planName} - ${hostel}`,
      html: getCodePurchaseAdminNotification({
        customerEmail: customerEmail || "N/A",
        planName,
        usersCount: planUsersCount || 0,
        price: planPrice,
        hostel,
        paymentRef: paymentRef || "N/A",
        claimedCode: decryptedCode,
      }),
    });
    // Admin has the code on file — record it so the webhook backstop won't
    // re-send a duplicate backup.
    try {
      await db
        .collection("dataPurchases")
        .doc(purchaseRefId)
        .update({ adminNotified: true });
    } catch (flagErr) {
      console.error("Failed to set adminNotified flag (background):", flagErr);
    }
  } catch (adminEmailError) {
    console.error("Error sending admin notification (background):", adminEmailError);
  }
}
