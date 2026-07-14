import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("dataPlans")
      .where("planType", "==", "tv")
      .get();

    const plans = snap.docs
      .map((d) => ({
        id: d.id,
        name: d.data().name as string,
        duration: d.data().duration as number,
        price: d.data().price as number,
        isActive: d.data().isActive !== false,
      }))
      .filter((p) => p.isActive)
      .sort((a, b) => a.price - b.price);

    return NextResponse.json({ plans });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
