import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// In-memory cache: key → { count, cachedAt }
// Short TTL — we want the low-stock signal on the plan cards to be reasonably
// fresh. The truth comes from the atomic reserve transaction; this is UX.
const cache = new Map<string, { count: number; cachedAt: number }>();
const CACHE_TTL = 5_000; // 5 seconds

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";
    const hostel = typeof body.hostel === "string" ? body.hostel.trim() : "";
    // Callers can bypass the cache (e.g. immediately after a reserve/claim/release)
    // to make the UI reflect the change without waiting up to 5s.
    const fresh = body.fresh === true;

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }
    if (!hostel) {
      return NextResponse.json({ error: "Missing hostel" }, { status: 400 });
    }

    const cacheKey = `${planId}:${hostel}`;
    const cached = cache.get(cacheKey);
    if (!fresh && cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return NextResponse.json({
        available: cached.count > 0,
        count: cached.count,
      });
    }

    const db = getAdminDb();
    // Pull a bounded batch and filter in JS. Avoids needing an "OR" query
    // that Firestore doesn't support natively.
    const snap = await db
      .collection("dataCodes")
      .where("planId", "==", planId)
      .where("hostel", "==", hostel)
      .limit(500)
      .get();

    const nowMs = Date.now();
    const availableCount = snap.docs.filter((doc) => {
      const r = doc.data().reservedUntil as Timestamp | undefined;
      if (!r) return true;
      return r.toMillis() <= nowMs;
    }).length;

    cache.set(cacheKey, { count: availableCount, cachedAt: Date.now() });

    return NextResponse.json({
      available: availableCount > 0,
      count: availableCount,
    });
  } catch (error: any) {
    console.error("Error checking code availability:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to check availability" },
      { status: 500 },
    );
  }
}
