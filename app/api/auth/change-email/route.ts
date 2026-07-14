import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { sendEmail } from "@/lib/email/emailService";
import { getVerificationCodeEmail } from "@/lib/email/emailTemplates";
import { generateCode, storeCode } from "@/lib/verificationCode";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newEmail =
      typeof body.newEmail === "string"
        ? body.newEmail.trim().toLowerCase()
        : "";
    const idToken =
      typeof body.idToken === "string" ? body.idToken.trim() : "";

    if (!newEmail || !idToken) {
      return NextResponse.json(
        { error: "New email and authentication token are required" },
        { status: 400 },
      );
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Verify the caller's identity and ensure fresh session
    getAdminApp();
    const adminAuth = getAuth();
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token. Please sign in again." },
        { status: 401 },
      );
    }

    // Require recent authentication (within 5 minutes for email changes)
    const authAge = Math.floor(Date.now() / 1000) - decoded.auth_time;
    if (authAge > 5 * 60) {
      return NextResponse.json(
        {
          error: "Please re-authenticate before changing your email.",
          code: "SESSION_EXPIRED",
        },
        { status: 403 },
      );
    }

    const userId = decoded.uid;
    const db = getAdminDb();

    // Check the new email isn't already in use by another user
    const existingUser = await db
      .collection("users")
      .where("email", "==", newEmail)
      .limit(1)
      .get();

    if (!existingUser.empty && existingUser.docs[0].id !== userId) {
      return NextResponse.json(
        { error: "This email is already associated with another account." },
        { status: 409 },
      );
    }

    // Update email in Firebase Auth
    try {
      await adminAuth.updateUser(userId, { email: newEmail });
    } catch (authError: any) {
      if (authError.code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "This email is already in use." },
          { status: 409 },
        );
      }
      throw authError;
    }

    // Mark user as unverified in Firestore and update email
    await db.collection("users").doc(userId).update({
      email: newEmail,
      emailVerified: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Generate new verification code and send to new email
    const code = generateCode();
    await storeCode(userId, code);

    try {
      const emailHtml = getVerificationCodeEmail({ code, email: newEmail });
      await sendEmail({
        to: newEmail,
        subject: "Lodge Internet — Verify Your New Email",
        html: emailHtml,
        senderName: "Lodge Internet",
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      // Email update succeeded but verification email failed — user can resend
    }

    return NextResponse.json({
      success: true,
      message:
        "Email updated. A verification code has been sent to your new email.",
    });
  } catch (error: any) {
    console.error("Error changing email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to change email" },
      { status: 500 },
    );
  }
}
