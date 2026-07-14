import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — fetch all transactions (dataPurchases + tvSubscriptions)
export async function GET() {
  try {
    const db = getAdminDb();

    const [dpSnap, tvSnap] = await Promise.all([
      db.collection("dataPurchases").orderBy("purchasedAt", "desc").get(),
      db.collection("tvSubscriptions").orderBy("paidAt", "desc").get(),
    ]);

    const dataPurchases = dpSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        planId: d.planId ?? "",
        planName: d.planName ?? "",
        planType: d.planType === "unlimited" ? "unlimited" : "device",
        usersCount: d.usersCount ?? undefined,
        price: d.price ?? 0,
        codeId: d.codeId ?? undefined,
        customerEmail: d.customerEmail ?? "",
        paymentRef: d.paymentRef ?? "",
        hostel: d.hostel ?? "",
        purchasedAt: d.purchasedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    const tvPurchases = tvSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        planId: d.planId ?? "",
        planName: d.planName ?? "",
        planType: "tv" as const,
        price: d.price ?? 0,
        customerEmail: d.email ?? "",
        paymentRef: d.paymentRef ?? "",
        hostel: d.hostel ?? "",
        purchasedAt: d.paidAt?.toDate?.()?.toISOString() ?? d.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json(
      { dataPurchases, tvPurchases },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    console.error("[admin/transactions GET]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch transactions" },
      { status: 500 },
    );
  }
}
