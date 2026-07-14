import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { generateCode, storeResetCode } from "@/lib/verificationCode";
import { sendEmail } from "@/lib/email/emailService";
import { getPasswordResetCodeEmail } from "@/lib/email/emailTemplates";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const db = getAdminDb();

    // Look up user by email
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();

    // Always return success even if email not found — prevents email enumeration
    if (snap.empty) {
      return NextResponse.json({ success: true });
    }

    const userDoc = snap.docs[0];
    const userId = userDoc.id;
    const data = userDoc.data();

    // Account exists but not yet verified — password reset doesn't apply yet.
    // Tell the frontend so it can show an actionable message instead of silently
    // advancing to a code step that will never be filled.
    if (!data.emailVerified) {
      return NextResponse.json(
        { success: false, notVerified: true },
        { status: 403 },
      );
    }

    // Generate + store reset code (10-min TTL, auto-expires in Redis)
    const code = generateCode();
    await storeResetCode(userId, code);

    // Send email — propagate failure so the frontend knows the code wasn't sent
    await sendEmail({
      to: email,
      subject: "Reset Your Password — Lodge Internet",
      html: getPasswordResetCodeEmail({ code, email }),
      senderName: "Lodge Internet",
    });

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
