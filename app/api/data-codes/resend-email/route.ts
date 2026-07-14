import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getDeviceCodeEmail } from "@/lib/email/emailTemplates";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";

/**
 * POST /api/data-codes/resend-email
 *
 * Re-sends the code-delivery email for one of the caller's own data purchases.
 * Customer-driven recovery path for spam-filtered / lost delivery emails.
 *
 * Body: { purchaseId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const purchaseId =
      typeof body?.purchaseId === "string" ? body.purchaseId.trim() : "";

    if (!purchaseId) {
      return NextResponse.json(
        { error: "purchaseId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyAuth(request, body);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    const db = getAdminDb();
    const docRef = db.collection("dataPurchases").doc(purchaseId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 },
      );
    }

    const data = docSnap.data()!;
    const purchaseEmail = (data.customerEmail || "").toLowerCase();

    if (purchaseEmail !== auth.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "You don't have permission to resend this email." },
        { status: 403 },
      );
    }

    if (!data.claimedCode) {
      return NextResponse.json(
        {
          error:
            "There's no code attached to this purchase yet. Our team has been notified — please give it a moment.",
        },
        { status: 409 },
      );
    }

    // Look up the hostel password (used in the email body)
    let hostelPassword: string | undefined;
    try {
      const hostelSnap = await db
        .collection("hostels")
        .where("name", "==", data.hostel)
        .limit(1)
        .get();
      if (!hostelSnap.empty) {
        hostelPassword = hostelSnap.docs[0].data().password || undefined;
      }
    } catch {
      // hostel password is optional, soldier on
    }

    const html = getDeviceCodeEmail({
      customerEmail: auth.user.email,
      planName: data.planName || "Lodge Internet plan",
      usersCount: data.usersCount || 0,
      duration: "As specified",
      price: data.price || 0,
      code: data.claimedCode,
      hostel: data.hostel || "",
      hostelPassword,
    });

    await sendEmail({
      to: auth.user.email,
      subject: `Your Lodge Internet Access Code - ${data.planName || "Plan"} (${data.hostel || "Hostel"})`,
      html,
      senderName: "Lodge Internet",
    });

    await docRef.update({
      emailSent: true,
      emailSentAt: FieldValue.serverTimestamp(),
      lastResendAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error resending code email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to resend email" },
      { status: 500 },
    );
  }
}
