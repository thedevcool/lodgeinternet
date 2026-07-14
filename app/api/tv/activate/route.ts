import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getTVSubscriptionActivatedEmail } from "@/lib/email/emailTemplates";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId : "";

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const subscriptionRef = db.collection("tvSubscriptions").doc(subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();

    if (!subscriptionSnap.exists) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    const subscription = subscriptionSnap.data()!;

    if (subscription.subscriptionStatus === "active") {
      return NextResponse.json(
        { error: "Subscription is already active" },
        { status: 400 },
      );
    }

    const activatedAt = new Date();
    const expiresAt = new Date(
      activatedAt.getTime() + subscription.duration * 24 * 60 * 60 * 1000,
    );

    await subscriptionRef.update({
      subscriptionStatus: "active",
      activatedAt,
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      const activationEmailHtml = getTVSubscriptionActivatedEmail({
        customerName: subscription.name || subscription.email.split("@")[0],
        planName: subscription.planName,
        duration: subscription.duration,
        activatedAt: activatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      await sendEmail({
        to: subscription.email,
        subject: `Your TV Subscription is Now Active! - ${subscription.planName}`,
        html: activationEmailHtml,
        senderName: "Lodge Internet",
      });
    } catch (emailError) {
      console.error("Error sending activation email:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "Subscription activated successfully",
      activatedAt,
      expiresAt,
    });
  } catch (error: any) {
    console.error("Error activating subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to activate subscription" },
      { status: 500 },
    );
  }
}
