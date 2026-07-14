import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/support-contacts?hostelId=<hostel_id>
 *
 * Returns the WhatsApp support contacts (sub-admins) relevant for a given
 * hostel.  Only active sub-admins with a whatsappPhone set are returned.
 *
 * Matching logic:
 *   - Sub-admin has an empty `hostels` array → available for ALL hostels
 *   - Sub-admin has the requested hostelId in their `hostels` array → included
 *
 * Only exposes `username` and `whatsappPhone` — no sensitive data.
 */
export async function GET(request: NextRequest) {
  const hostelId = request.nextUrl.searchParams.get("hostelId");

  if (!hostelId) {
    return NextResponse.json(
      { error: "hostelId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection("adminUsers")
      .where("isActive", "==", true)
      .get();

    const contacts: { username: string; whatsappPhone: string }[] = [];

    snap.docs.forEach((doc) => {
      const d = doc.data();
      const phone: string = d.whatsappPhone ?? "";
      if (!phone) return; // skip admins without a whatsapp number

      const hostels: string[] = d.hostels ?? [];
      const isAllHostels = hostels.length === 0;
      const hasThisHostel = hostels.includes(hostelId);

      if (isAllHostels || hasThisHostel) {
        contacts.push({
          username: d.username ?? "Support",
          whatsappPhone: phone,
        });
      }
    });

    return NextResponse.json({ contacts });
  } catch (err: any) {
    console.error("[support-contacts GET]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
