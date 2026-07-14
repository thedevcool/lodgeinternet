import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — fetch all data plans ordered by name
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("dataPlans").orderBy("name", "asc").get();

    const plans = snap.docs.map((doc) => {
      const d = doc.data();
      // Infer planType for legacy plans that don't have it stored
      let planType = d.planType;
      if (!planType) {
        planType = d.usersCount ? "device" : "tv";
      }
      return {
        id: doc.id,
        name: d.name ?? "",
        planType,
        price: d.price ?? 0,
        usersCount: d.usersCount ?? undefined,
        duration: d.duration ?? undefined,
        unlimitedPeriod: d.unlimitedPeriod ?? undefined,
        hostelId: d.hostelId ?? "",
        isActive: d.isActive ?? true,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ plans });
  } catch (error: any) {
    console.error("[admin/plans GET]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch plans" },
      { status: 500 },
    );
  }
}
