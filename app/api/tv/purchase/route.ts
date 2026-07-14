import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { encryptMacAddress } from "@/lib/macAddressCrypto";
import { sendEmail } from "@/lib/email/emailService";
import {
  getTVSubscriptionCreatedEmail,
  getTVSubscriptionAdminNotification,
} from "@/lib/email/emailTemplates";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";
import { verifyPaystackPayment, paystackErrorStatus } from "@/lib/paystackVerify";

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const macAddress = typeof body.macAddress === "string" ? body.macAddress.trim() : "";
    const planId = typeof body.planId === "string" ? body.planId : "";
    const paymentRef = typeof body.paymentRef === "string" ? body.paymentRef : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";
    const isNewUser = body.isNewUser === true;

    if (!email || !planId || !paymentRef) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── Server-side auth: verify token, hostel match, fresh session ──
    const auth = await verifyAuth(request, body, {
      requireFreshSession: true,
      expectedHostel: hostel || undefined,
    });

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    if (email && email !== auth.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Purchase email must match your account email." },
        { status: 403 },
      );
    }

    if (isNewUser && (!name || !macAddress)) {
      return NextResponse.json(
        { error: "Name and MAC address are required for new users" },
        { status: 400 },
      );
    }

    if (macAddress && !MAC_REGEX.test(macAddress)) {
      return NextResponse.json(
        { error: "Please enter a valid MAC address (e.g., 00:1A:2B:3C:4D:5E)" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // Get plan details
    const planSnap = await db.collection("dataPlans").doc(planId).get();
    if (!planSnap.exists || planSnap.data()!.planType !== "tv") {
      return NextResponse.json({ error: "Invalid TV plan" }, { status: 404 });
    }
    const plan = planSnap.data()!;

    // Idempotency: if this reference already created a subscription (e.g. the
    // webhook beat the client callback, or a double-submit), don't create a
    // second one.
    const existingSub = await db
      .collection("tvSubscriptions")
      .where("paymentRef", "==", paymentRef)
      .limit(1)
      .get();
    if (!existingSub.empty) {
      return NextResponse.json({
        success: true,
        subscriptionId: existingSub.docs[0].id,
        isNewUser,
        duplicate: true,
        message: "Your subscription is already on file.",
      });
    }

    // ── Verify the payment with Paystack BEFORE creating the subscription ──
    // Same gate as the data-code claim: confirm a successful charge for at
    // least the plan price before granting anything.
    const verification = await verifyPaystackPayment({
      reference: paymentRef,
      minAmountKobo: Math.round((Number(plan.price) || 0) * 100),
    });
    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.message, code: verification.code },
        { status: paystackErrorStatus(verification.code) },
      );
    }

    // Build subscription data
    const subscriptionData: any = {
      email,
      planId,
      planName: plan.name,
      duration: plan.duration,
      price: plan.price,
      paymentRef,
      paymentStatus: "paid",
      subscriptionStatus: "pending_activation",
      hostel: hostel || "N/A",
      paidAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (isNewUser) {
      subscriptionData.name = name;
      subscriptionData.macAddressHash = encryptMacAddress(macAddress);
      subscriptionData.userId = "";
    } else {
      // Use the verified UID, not whatever the client posts
      subscriptionData.userId = auth.user.uid;
      const existingSubSnap = await db.collection("tvSubscriptions")
        .where("email", "==", email)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
      subscriptionData.name = !existingSubSnap.empty
        ? existingSubSnap.docs[0].data().name || email.split("@")[0]
        : email.split("@")[0];
      // First-time TV purchasers send a MAC — attach it to the new sub.
      if (macAddress) {
        subscriptionData.macAddressHash = encryptMacAddress(macAddress);
      }
    }

    const newSubscription = await db.collection("tvSubscriptions").add(subscriptionData);

    // Best-effort back-fill: if a MAC was provided and the user has prior
    // MAC-less subs (e.g. webhook-created), back-fill them so the dashboard
    // stops nagging the user about something they just submitted.
    if (macAddress && !isNewUser) {
      try {
        const orphans = await db
          .collection("tvSubscriptions")
          .where("email", "==", email)
          .get();
        const encrypted = encryptMacAddress(macAddress);
        const batch = db.batch();
        let updates = 0;
        orphans.docs.forEach((doc) => {
          if (doc.id === newSubscription.id) return;
          const data = doc.data();
          if (data.macAddressHash) return;
          batch.update(doc.ref, {
            macAddressHash: encrypted,
            migrationNote: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          updates++;
        });
        if (updates > 0) await batch.commit();
      } catch (backfillError) {
        console.error("Error back-filling MAC on prior subs:", backfillError);
      }
    }

    // Send email notifications (non-fatal)
    try {
      await sendEmail({
        to: email,
        subject: `TV Unlimited Subscription Created - ${plan.name}`,
        html: getTVSubscriptionCreatedEmail({
          customerName: isNewUser ? name : email.split("@")[0],
          customerEmail: email,
          planName: plan.name,
          duration: plan.duration,
          price: plan.price,
          paymentRef,
        }),
        senderName: "Lodge Internet",
      });

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `New TV Subscription - ${plan.name} - ${isNewUser ? name : email}`,
          html: getTVSubscriptionAdminNotification({
            customerName: isNewUser ? name : email.split("@")[0],
            customerEmail: email,
            macAddress: isNewUser ? macAddress : "Existing user - no MAC update",
            planName: plan.name,
            duration: plan.duration,
            price: plan.price,
            paymentRef,
            subscriptionId: newSubscription.id,
          }),
          senderName: "Lodge Internet",
        });
      }
    } catch (emailError) {
      console.error("Error sending subscription emails:", emailError);
    }

    return NextResponse.json({
      success: true,
      subscriptionId: newSubscription.id,
      isNewUser,
      message: isNewUser
        ? "Payment successful. Please create your password to access your dashboard."
        : "Payment successful. Your subscription is pending admin activation.",
    });
  } catch (error: any) {
    console.error("Error processing purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process purchase" },
      { status: 500 },
    );
  }
}
