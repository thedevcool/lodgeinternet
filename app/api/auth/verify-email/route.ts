import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/emailService";
import { getWelcomeAccountEmail } from "@/lib/email/emailTemplates";
import { verifyCode } from "@/lib/verificationCode";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";

    if (!userId || !code) {
      return NextResponse.json(
        { error: "User ID and code are required" },
        { status: 400 },
      );
    }

    // Verify that the caller is the same user whose code is being verified
    if (idToken) {
      const { getAdminApp } = await import("@/lib/firebaseAdmin");
      const { getAuth } = await import("firebase-admin/auth");
      try {
        getAdminApp();
        const decoded = await getAuth().verifyIdToken(idToken);
        if (decoded.uid !== userId) {
          return NextResponse.json(
            { error: "Token does not match user ID." },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid authentication token." },
          { status: 401 },
        );
      }
    }

    // Atomic Lua verification in Redis:
    //  - If correct: deletes code + resets attempts in one operation
    //  - If wrong: increments attempt counter
    //  - If locked out: rejects immediately
    // No race condition even with concurrent requests.
    const result = await verifyCode(userId, code);

    if (!result.ok) {
      const messages = {
        expired:
          "Verification code has expired. Please request a new one.",
        wrong_code:
          "Invalid verification code. Please try again.",
        locked_out:
          "Too many failed attempts. Please wait 15 minutes and request a new code.",
      };

      return NextResponse.json(
        { error: messages[result.reason] },
        { status: result.reason === "locked_out" ? 429 : 400 },
      );
    }

    const db = getAdminDb();

    // Mark user as verified in Firestore
    await db.collection("users").doc(userId).update({
      emailVerified: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Get user data for welcome email
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    // Send welcome email (non-blocking — verification already succeeded)
    if (userData) {
      try {
        const emailHtml = getWelcomeAccountEmail({
          displayName: userData.displayName || userData.email.split("@")[0],
          hostel: userData.hostelId,
        });
        await sendEmail({
          to: userData.email,
          subject: "Welcome to Lodge Internet!",
          html: emailHtml,
          senderName: "Lodge Internet",
        });
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError);
        // Don't fail — verification succeeded
      }
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error: any) {
    console.error("Error verifying email:", error);
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: 500 },
    );
  }
}
