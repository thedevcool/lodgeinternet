import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { generateCode, storeCode } from "@/lib/verificationCode";
import { sendEmail } from "@/lib/email/emailService";
import { getVerificationCodeEmail } from "@/lib/email/emailTemplates";
import { toHostelSlug } from "@/lib/hostelSlug";

/**
 * POST /api/auth/resend-code
 *
 * Resend a verification code for an existing but unverified account, looked up
 * by email rather than userId. Used when the register page detects
 * "auth/email-already-in-use" — i.e. the user started onboarding but never
 * verified.
 *
 * Body:
 *   email   — the user's email address
 *   hostel? — update the hostelId if provided (useful when coming from a reminder link)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const hostel =
      typeof body.hostel === "string" ? body.hostel.trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();
    const snap = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { error: "No account found for this email address." },
        { status: 404 },
      );
    }

    const userDoc = snap.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Already verified — nothing to resend
    if (userData.emailVerified) {
      return NextResponse.json(
        { error: "This account is already verified. Please sign in.", alreadyVerified: true },
        { status: 409 },
      );
    }

    // Update hostelId if a valid one was provided
    if (hostel && hostel !== "Unknown") {
      await db.collection("users").doc(userId).update({
        hostelId: hostel,
        hostelSlug: toHostelSlug(hostel),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Generate + store a fresh code
    const code = generateCode();
    await storeCode(userId, code);

    // Send the verification email
    await sendEmail({
      to: email,
      subject: "Lodge Internet — Verify Your Email",
      html: getVerificationCodeEmail({ code, email }),
      senderName: "Lodge Internet",
    });

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error("[resend-code]", error);
    return NextResponse.json(
      { error: error.message || "Failed to resend verification code" },
      { status: 500 },
    );
  }
}
