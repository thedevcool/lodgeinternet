import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

// PATCH — update mutable profile fields (currently: hostelId)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const userId =
      typeof body.userId === "string" ? body.userId.trim() : "";
    const hostelId =
      typeof body.hostelId === "string" ? body.hostelId.trim() : null;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!hostelId) {
      return NextResponse.json(
        { error: "hostelId is required" },
        { status: 400 },
      );
    }

    // Verify the caller owns this account
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!idToken) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    getAdminApp();
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      if (decoded.uid !== userId) {
        return NextResponse.json(
          { error: "Token does not match user ID." },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 },
      );
    }

    const db = getAdminDb();
    await db.collection("users").doc(userId).update({
      hostelId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, hostelId });
  } catch (error: any) {
    console.error("[profile PATCH]", error);
    return NextResponse.json(
      { error: error.message || "Failed to update profile" },
      { status: 500 },
    );
  }
}
