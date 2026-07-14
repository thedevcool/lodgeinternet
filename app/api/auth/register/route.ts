import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getVerificationCodeEmail } from "@/lib/email/emailTemplates";
import { toHostelSlug } from "@/lib/hostelSlug";
import { generateCode, storeCode } from "@/lib/verificationCode";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";
    const collageSlug =
      typeof body.collageSlug === "string" ? body.collageSlug.trim() : "";
    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : email.split("@")[0];

    if (!userId || !email) {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 },
      );
    }

    const db = getAdminDb();

    // Check if user profile already exists
    const existingUser = await db.collection("users").doc(userId).get();
    if (existingUser.exists) {
      const userData = existingUser.data();
      if (userData?.emailVerified) {
        return NextResponse.json(
          { error: "Account already verified", alreadyVerified: true },
          { status: 409 },
        );
      }
      // User exists but not verified — resend code
    }

    // For new users, hostel is required
    if (!existingUser.exists && !hostel) {
      return NextResponse.json(
        { error: "User ID, email, and hostel are required" },
        { status: 400 },
      );
    }

    // Preserve existing hostelId if the incoming value is empty or placeholder.
    // This prevents the resend-code flow (verifyOnly mode, no hostel in URL)
    // from overwriting the real hostel with "Unknown".
    const existingHostelId = existingUser.exists
      ? (existingUser.data()?.hostelId ?? "")
      : "";
    const isValidIncoming = hostel && hostel !== "Unknown";
    const effectiveHostel = isValidIncoming
      ? hostel
      : existingHostelId || hostel;

    // Generate crypto-secure 6-digit code (OS CSPRNG via crypto.randomInt)
    const code = generateCode();

    // Create/update user profile in Firestore
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          email,
          displayName,
          hostelId: effectiveHostel,
          hostelSlug: toHostelSlug(effectiveHostel),
          ...(collageSlug && { collageSlug }),
          emailVerified: false,
          updatedAt: FieldValue.serverTimestamp(),
          ...(existingUser.exists
            ? {}
            : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );

    // Store code in Redis with 10-min TTL (auto-expires, no cleanup needed)
    // Also resets failed-attempt counter
    await storeCode(userId, code);

    // Send verification email
    try {
      const emailHtml = getVerificationCodeEmail({ code, email });
      await sendEmail({
        to: email,
        subject: "Lodge Internet \u2014 Verify Your Email",
        html: emailHtml,
        senderName: "Lodge Internet",
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error: any) {
    console.error("Error in register:", error);
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: 500 },
    );
  }
}
