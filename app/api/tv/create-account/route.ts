import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

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

    // Verify the caller's Firebase ID token directly.
    // verifyAuth() is not used here because TV users link their subscription
    // immediately after creating a Firebase Auth account — before any
    // Firestore profile / email-verification record exists.
    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    getAdminApp();
    let callerUid = "";
    let callerEmail = "";
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      callerUid = decoded.uid;
      callerEmail = (decoded.email || "").toLowerCase();
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 },
      );
    }

    const db = getAdminDb();
    const subRef = db.collection("tvSubscriptions").doc(subscriptionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    const sub = subSnap.data()!;
    const subEmail = typeof sub.email === "string" ? sub.email.toLowerCase() : "";

    if (subEmail && callerEmail && subEmail !== callerEmail) {
      return NextResponse.json(
        { error: "You don't have permission to link this subscription." },
        { status: 403 },
      );
    }

    if (sub.userId && sub.userId !== callerUid) {
      return NextResponse.json(
        { error: "Subscription is already linked to a different account." },
        { status: 409 },
      );
    }

    await subRef.update({
      userId: callerUid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Account linked to subscription successfully.",
    });
  } catch (error: any) {
    console.error("Error linking account to subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to link account to subscription" },
      { status: 500 },
    );
  }
}
