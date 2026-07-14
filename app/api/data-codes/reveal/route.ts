import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";

/**
 * POST /api/data-codes/reveal
 *
 * Returns the claimed code for one of the caller's own data purchases.
 * This is the customer's self-service recovery path when the original
 * delivery email was lost, filtered, or sent to the wrong address.
 *
 * Body: { purchaseId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const purchaseId =
      typeof body?.purchaseId === "string" ? body.purchaseId.trim() : "";

    if (!purchaseId) {
      return NextResponse.json(
        { error: "purchaseId is required" },
        { status: 400 },
      );
    }

    const auth = await verifyAuth(request, body);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    const db = getAdminDb();
    const docSnap = await db.collection("dataPurchases").doc(purchaseId).get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: "Purchase not found" },
        { status: 404 },
      );
    }

    const data = docSnap.data()!;
    const purchaseEmail = (data.customerEmail || "").toLowerCase();

    if (purchaseEmail !== auth.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "You don't have permission to view this code." },
        { status: 403 },
      );
    }

    if (!data.claimedCode) {
      return NextResponse.json(
        {
          error:
            "This purchase has no code yet. It's awaiting fulfilment — our team has been notified.",
          deliveryStatus: data.deliveryStatus || "pending",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      code: data.claimedCode,
      planName: data.planName || "",
      hostel: data.hostel || "",
      purchasedAt:
        data.purchasedAt?.toDate?.()?.toISOString() ?? null,
    });
  } catch (error: any) {
    console.error("Error revealing code:", error);
    return NextResponse.json(
      { error: error.message || "Failed to retrieve code" },
      { status: 500 },
    );
  }
}
