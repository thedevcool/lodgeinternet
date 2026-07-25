import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyAuth, authErrorStatus } from "@/lib/verifyAuth";

/**
 * Reservation window: 1 hour. While reserved, the code belongs to this buyer
 * and nobody else can take it. If they don't complete payment within the hour,
 * the hold lapses and the code returns to base (any code whose `reservedUntil`
 * is in the past is treated as available again by reserve/claim/availability).
 */
const RESERVATION_TTL_MS = 60 * 60 * 1000;

/**
 * POST /api/data-codes/reserve
 *
 * Atomically reserves one available data code for the caller. The reservation
 * is keyed to the caller's UID and held for RESERVATION_TTL_MS; any code with
 * `reservedUntil` in the future is treated as taken by everyone else.
 *
 * Body: { planId, hostel }
 * Returns: { reservationId, expiresAt }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
    const hostel = typeof body?.hostel === "string" ? body.hostel.trim() : "";

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }
    if (!hostel) {
      return NextResponse.json({ error: "Missing hostel" }, { status: 400 });
    }

    const auth = await verifyAuth(request, body, {
      requireFreshSession: true,
      expectedHostel: hostel,
    });
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error.message, code: auth.error.code },
        { status: authErrorStatus(auth.error) },
      );
    }

    const db = getAdminDb();
    const nowMs = Date.now();
    const expiresAt = Timestamp.fromMillis(nowMs + RESERVATION_TTL_MS);

    // Run in a transaction so two concurrent reservations against the last
    // code cannot both succeed. Worst case: one wins, the other gets NO_CODES.
    const reservationId = await db.runTransaction(async (transaction) => {
      // One active hold per user per plan+hostel. If this user already holds a
      // live reservation, reuse and refresh it instead of grabbing another
      // code. This caps a single account at one held code and kills the
      // "reserve every code to lock everyone else out" sabotage.
      const mine = await transaction.get(
        db
          .collection("dataCodes")
          .where("planId", "==", planId)
          .where("hostel", "==", hostel)
          .where("reservedBy", "==", auth.user.uid)
          .limit(5),
      );

      const existing = mine.docs.find((doc) => {
        const r = doc.data().reservedUntil as Timestamp | undefined;
        return r ? r.toMillis() > nowMs : false;
      });

      if (existing) {
        transaction.update(existing.ref, {
          reservedUntil: expiresAt,
          reservedAt: FieldValue.serverTimestamp(),
        });
        return existing.id;
      }

      // Pull a small batch — old codes with no reservedUntil + new codes whose
      // reservation may have expired. Filtering in JS lets us handle both
      // cases without requiring a composite index for `reservedUntil is null`.
      const snap = await transaction.get(
        db
          .collection("dataCodes")
          .where("planId", "==", planId)
          .where("hostel", "==", hostel)
          .limit(25),
      );

      const candidate = snap.docs.find((doc) => {
        const r = doc.data().reservedUntil as Timestamp | undefined;
        if (!r) return true;
        return r.toMillis() <= nowMs;
      });

      if (!candidate) {
        throw new Error("NO_CODES");
      }

      transaction.update(candidate.ref, {
        reservedUntil: expiresAt,
        reservedBy: auth.user.uid,
        reservedEmail: auth.user.email ?? "",
        reservedAt: FieldValue.serverTimestamp(),
      });

      return candidate.id;
    });

    return NextResponse.json({
      reservationId,
      expiresAt: expiresAt.toMillis(),
    });
  } catch (error: any) {
    if (error?.message === "NO_CODES") {
      return NextResponse.json(
        {
          error:
            "Sorry, no codes are available for this plan right now. Please try again in a few minutes.",
          code: "NO_CODES",
        },
        { status: 409 },
      );
    }
    console.error("Error reserving data code:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to reserve code" },
      { status: 500 },
    );
  }
}
