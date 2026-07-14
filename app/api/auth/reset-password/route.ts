import { NextResponse } from "next/server";
import { getAdminDb, getAdminApp } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { verifyResetCode } from "@/lib/verificationCode";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!userId || !code || !newPassword) {
      return NextResponse.json({ error: "userId, code, and newPassword are required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Verify the reset code (deletes it atomically on success)
    const result = await verifyResetCode(userId, code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        expired: "Reset code has expired. Please request a new one.",
        wrong_code: "Incorrect code. Please try again.",
        locked_out: "Too many incorrect attempts. Please request a new reset code.",
      };
      return NextResponse.json(
        { error: messages[result.reason] ?? "Invalid code", code: result.reason },
        { status: 400 },
      );
    }

    // Verify userId exists and is verified
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.emailVerified) {
      return NextResponse.json({ error: "Account not found or not verified" }, { status: 404 });
    }

    // Update the password via Firebase Admin Auth
    const adminAuth = getAuth(getAdminApp());
    await adminAuth.updateUser(userId, { password: newPassword });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[reset-password]", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
