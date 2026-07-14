import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";

/**
 * POST /api/data-codes/release
 *
 * Releases a reservation made via /api/data-codes/reserve. Called by the
 * client when the Paystack popup is closed without completing payment.
 * Only the user who reserved the code can release it. Idempotent: a no-op
 * if the code was already claimed (deleted) or never reserved.
 *
 * Body: { reservationId }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const reservationId =
      typeof body?.reservationId === "string" ? body.reservationId.trim() : "";

    if (!reservationId) {
      return NextResponse.json(
        { error: "reservationId is required" },
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
    const ref = db.collection("dataCodes").doc(reservationId);
    const snap = await ref.get();

    // Code was already claimed (deleted) — release is a no-op.
    if (!snap.exists) {
      return NextResponse.json({ success: true, released: false });
    }

    const data = snap.data()!;

    // Only the reservation holder can release it. If someone else now holds
    // the reservation (because ours expired and theirs is active), silently
    // succeed — they keep their hold.
    if (data.reservedBy && data.reservedBy !== auth.user.uid) {
      return NextResponse.json({ success: true, released: false });
    }

    await ref.update({
      reservedUntil: FieldValue.delete(),
      reservedBy: FieldValue.delete(),
      reservedAt: FieldValue.delete(),
    });

    return NextResponse.json({ success: true, released: true });
  } catch (error: any) {
    console.error("Error releasing reservation:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to release reservation" },
      { status: 500 },
    );
  }
}
