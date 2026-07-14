import { NextResponse } from "next/server";
import { getAdminApp, getAdminDb } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

// GET — fetch user profile + recent purchases
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() || "";

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    // Verify the caller is the same user they're fetching
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

    // Get user profile
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const profile = {
      id: userDoc.id,
      email: userData.email,
      displayName: userData.displayName,
      hostelId: userData.hostelId,
      hostelSlug: userData.hostelSlug,
      collageSlug: userData.collageSlug || undefined,
      emailVerified: userData.emailVerified,
      createdAt: userData.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: userData.updatedAt?.toDate?.()?.toISOString() || null,
    };

    // Fetch recent purchases (device + unlimited from dataPurchases)
    const dataPurchasesSnap = await db
      .collection("dataPurchases")
      .where("customerEmail", "==", userData.email)
      .orderBy("purchasedAt", "desc")
      .limit(20)
      .get();

    const dataPurchases = dataPurchasesSnap.docs.map((d) => {
      const data = d.data();
      const hasCode = !!data.claimedCode;
      // Default older rows (pre-deliveryStatus) to "delivered" when a code
      // is present, otherwise leave undefined so the dashboard can show the
      // appropriate fallback.
      const deliveryStatus: string =
        data.deliveryStatus || (hasCode ? "delivered" : "pending");
      return {
        id: d.id,
        planId: data.planId,
        planName: data.planName,
        planType: data.planType || "device",
        price: data.price ?? 0,
        paymentRef: data.paymentRef ?? "",
        hostel: data.hostel ?? "",
        purchasedAt: data.purchasedAt?.toDate?.()?.toISOString() || null,
        hasCode,
        deliveryStatus,
        emailSent: data.emailSent === true,
      };
    });

    // Fetch TV subscriptions
    const tvSubsSnap = await db
      .collection("tvSubscriptions")
      .where("email", "==", userData.email)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const tvPurchases = tvSubsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        planId: data.planId,
        planName: data.planName,
        planType: "tv" as const,
        price: data.price ?? 0,
        paymentRef: data.paymentRef ?? "",
        hostel: data.hostel ?? "N/A",
        subscriptionStatus: data.subscriptionStatus,
        purchasedAt: data.paidAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    // Merge and sort by date
    const purchases = [...dataPurchases, ...tvPurchases].sort(
      (a, b) =>
        new Date(b.purchasedAt || 0).getTime() -
        new Date(a.purchasedAt || 0).getTime(),
    );

    return NextResponse.json({ profile, purchases });
  } catch (error: any) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user" },
      { status: 500 },
    );
  }
}
