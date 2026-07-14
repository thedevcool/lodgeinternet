import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/waitlist
 *
 * Returns the full waitlist for the admin UI to slice client-side.
 * Matches the existing admin API posture (gated by the admin client UI,
 * not by server-side admin session — see ProtectedRoute).
 */
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("waitlist")
      .orderBy("createdAt", "desc")
      .get();

    const entries = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        email: d.email ?? "",
        whatsappPhone: d.whatsappPhone ?? "",
        audienceType: d.audienceType ?? "resident",
        affordability: d.affordability ?? "manage",
        // Student fields
        schoolName: d.schoolName ?? null,
        hostelName: d.hostelName ?? null,
        schoolAddress: d.schoolAddress ?? null,
        hostelOccupants:
          typeof d.hostelOccupants === "number" ? d.hostelOccupants : null,
        // Resident fields
        address: d.address ?? null,
        estate: d.estate ?? null,
        city: d.city ?? null,
        // Admin fields
        status: d.status ?? "new",
        notes: d.notes ?? "",
        ip: d.ip ?? null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json(
      { entries, count: entries.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    console.error("[admin/waitlist GET]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch waitlist" },
      { status: 500 },
    );
  }
}
