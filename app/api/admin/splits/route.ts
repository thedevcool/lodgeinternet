import { NextResponse } from "next/server";
import { getAdminDb, FieldValue } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("splitRecords").orderBy("createdAt", "desc").get();
    const splits = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }));
    return NextResponse.json({ splits });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      hostel, dateFrom, dateTo, isOpen, adminPercent, partnerPercent,
      maintenancePct, adminEmail, partnerEmail, sendMonthlyEmail,
      totalRevenue, splittableRevenue, adminShare, partnerShare,
      transactionCount, notes,
    } = body;

    if (!hostel || !dateFrom) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isOpen && !dateTo) {
      return NextResponse.json({ error: "dateTo is required for fixed-period splits" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = await db.collection("splitRecords").add({
      hostel,
      dateFrom,
      dateTo: isOpen ? "" : (dateTo ?? ""),
      isOpen: !!isOpen,
      adminPercent,
      partnerPercent,
      maintenancePct: typeof maintenancePct === "number" ? maintenancePct : 10,
      adminEmail: adminEmail ?? "",
      partnerEmail: partnerEmail ?? "",
      sendMonthlyEmail: !!sendMonthlyEmail,
      totalRevenue,
      splittableRevenue: splittableRevenue ?? null,
      adminShare,
      partnerShare,
      transactionCount,
      notes: notes ?? "",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const db = getAdminDb();
    await db.collection("splitRecords").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
